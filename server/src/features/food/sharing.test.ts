import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { appClient, createUser, signIn } from '../../../test/auth.ts'
import { tempDatabase } from '../../../test/helpers.ts'

const { db, dataDir } = tempDatabase()
for (const name of ['Ana', 'Ion', 'Eva']) await createUser(db, `${name.toLowerCase()}@example.com`, name)

const client = await appClient(db, dataDir)
const ana = await signIn(client, 'ana@example.com')
const ion = await signIn(client, 'ion@example.com')
const eva = await signIn(client, 'eva@example.com')
const anaId = (db.prepare("SELECT id FROM users WHERE email = 'ana@example.com'").get() as { id: string }).id

interface Month {
  exists: boolean
  shared: boolean
  totalBani?: number
  sources?: { id: string }[]
}

const send = (method: string, path: string, cookie: string, body?: unknown) =>
  client.request(method, path, { body, headers: { cookie } })
const codeOf = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code
const read = async (monthKey: string, cookie: string) =>
  (await (await send('GET', `/api/food/${monthKey}?today=2026-11-18`, cookie)).json()) as Month
const resolve = (monthKey: string, resolution: string, cookie = ana) =>
  send('POST', '/api/food/share/resolve', cookie, { monthKey, resolution })
const lastActivity = () =>
  db.prepare('SELECT action, metadata FROM activity_logs WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(anaId)

async function setUp(monthKey: string, cookie: string, amountBani: number, purchases = 0): Promise<void> {
  const res = await send('PUT', `/api/food/${monthKey}/sources?today=2026-11-18`, cookie, {
    sources: [{ name: 'Card', amountBani }],
  })
  const sourceId = ((await res.json()) as Month).sources?.[0]?.id
  for (let i = 0; i < purchases; i++) {
    await send('POST', `/api/food/${monthKey}/purchases`, cookie, {
      merchant: 'Lidl',
      amountBani: 1000,
      spentOn: `${monthKey}-05`,
      sourceId,
    })
  }
}

// Ana's own months, then a family of Ion's with some of the same months.
await setUp('2026-08', ana, 80000)
await setUp('2026-09', ana, 90000, 2)
await setUp('2026-10', ana, 100000)
await send('POST', '/api/family', ion, { name: 'Ionescu' })
await setUp('2026-08', ion, 1000)
await setUp('2026-10', ion, 110000, 1)
const { code } = (await (await send('POST', '/api/family/invites', ion)).json()) as { code: string }
await send('POST', '/api/family/join', ana, { code })

test('sharing is only for someone in a family', async () => {
  const res = await send('GET', '/api/food/share/preview', eva)
  assert.equal(res.status, 409)
  assert.equal(await codeOf(res), 'family_not_member')
})

describe('the preview', () => {
  test('lists the months that move as they are and those that clash, changing nothing', async () => {
    const res = await send('GET', '/api/food/share/preview', ana)
    assert.deepEqual(await res.json(), {
      clean: [{ monthKey: '2026-09', mine: { totalBani: 90000, purchaseCount: 2 } }],
      conflicts: [
        {
          monthKey: '2026-10',
          mine: { totalBani: 100000, purchaseCount: 0 },
          family: { totalBani: 110000, purchaseCount: 1 },
        },
        {
          monthKey: '2026-08',
          mine: { totalBani: 80000, purchaseCount: 0 },
          family: { totalBani: 1000, purchaseCount: 0 },
        },
      ],
    })
    assert.equal((await read('2026-09', ion)).exists, false)
  })
})

describe('sharing', () => {
  test('moves the months that do not clash and skips the others', async () => {
    const res = await send('POST', '/api/food/share', ana)
    assert.deepEqual(await res.json(), { moved: ['2026-09'], skipped: ['2026-10', '2026-08'] })
    const month = await read('2026-09', ion)
    assert.equal(month.shared, true)
    assert.equal(month.totalBani, 90000)
    assert.deepEqual({ ...lastActivity() }, { action: 'food.shared', metadata: '{"moved":1,"skipped":2}' })
  })

  test('a second time moves nothing and records nothing', async () => {
    const res = await send('POST', '/api/food/share', ana)
    assert.deepEqual(await res.json(), { moved: [], skipped: ['2026-10', '2026-08'] })
    assert.equal(lastActivity()?.action, 'food.shared')
  })
})

describe('settling a clash', () => {
  test('keeping one’s own is refused while the family’s month has purchases', async () => {
    const res = await resolve('2026-10', 'keep_mine')
    assert.equal(res.status, 409)
    assert.equal(await codeOf(res), 'food_family_month_has_purchases')
  })

  test('keeping the family’s deletes the personal month', async () => {
    const res = await resolve('2026-10', 'keep_theirs')
    assert.deepEqual(await res.json(), { monthKey: '2026-10', resolution: 'keep_theirs' })
    assert.equal((await read('2026-10', ana)).totalBani, 110000)
    assert.equal(db.prepare("SELECT count(*) AS n FROM food_budgets WHERE month_key = '2026-10'").get()?.n, 1)
    assert.deepEqual({ ...lastActivity() }, {
      action: 'food.share_resolved',
      metadata: '{"monthKey":"2026-10","resolution":"keep_theirs"}',
    })
  })

  test('keeping one’s own replaces the family’s month', async () => {
    assert.equal((await resolve('2026-08', 'keep_mine')).status, 200)
    assert.equal((await read('2026-08', ion)).totalBani, 80000)
    assert.equal(db.prepare("SELECT count(*) AS n FROM food_budgets WHERE month_key = '2026-08'").get()?.n, 1)
  })

  test('is refused for a month without a clash', async () => {
    for (const monthKey of ['2026-08', '2026-12']) {
      const res = await resolve(monthKey, 'keep_theirs')
      assert.equal(res.status, 404)
      assert.equal(await codeOf(res), 'food_no_clash')
    }
  })

  test('takes a known choice', async () => {
    assert.equal((await resolve('2026-08', 'merge')).status, 400)
  })

  test('lets the last member leave once it is done', async () => {
    // Eva brings a month of her own into Ana's family, then is its last member.
    await setUp('2027-02', eva, 2000)
    await send('POST', '/api/family/owner', ion, { userId: anaId })
    await send('POST', '/api/family/leave', ion)
    const { code } = (await (await send('POST', '/api/family/invites', ana)).json()) as { code: string }
    await send('POST', '/api/family/join', eva, { code })
    await setUp('2027-02', ana, 3000)
    const evaId = (db.prepare("SELECT id FROM users WHERE email = 'eva@example.com'").get() as { id: string }).id
    await send('POST', '/api/family/owner', ana, { userId: evaId })
    await send('POST', '/api/family/leave', ana)

    assert.equal(await codeOf(await send('POST', '/api/family/leave', eva)), 'family_dissolve_conflicts')
    assert.equal((await resolve('2027-02', 'keep_theirs', eva)).status, 200)
    assert.deepEqual(await (await send('POST', '/api/family/leave', eva)).json(), { ok: true, dissolved: true })
    const month = await read('2027-02', eva)
    assert.deepEqual([month.shared, month.totalBani], [false, 3000])
  })
})
