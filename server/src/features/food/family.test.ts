import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { appClient, createUser, signIn, TEST_PASSWORD } from '../../../test/auth.ts'
import { tempDatabase } from '../../../test/helpers.ts'

/* Food months shared by a family: every member sees and changes them, no
   one outside does, and they stay with the family as members come and go. */

const { db, dataDir } = tempDatabase()
for (const name of ['Ana', 'Ion', 'Eva', 'Dan']) await createUser(db, `${name.toLowerCase()}@example.com`, name)

const client = await appClient(db, dataDir)
const ana = await signIn(client, 'ana@example.com')
const ion = await signIn(client, 'ion@example.com')
const eva = await signIn(client, 'eva@example.com')
const dan = await signIn(client, 'dan@example.com')
const idOf = (name: string) =>
  (db.prepare('SELECT id FROM users WHERE email = ?').get(`${name.toLowerCase()}@example.com`) as { id: string }).id

interface Month {
  shared: boolean
  exists: boolean
  sources?: { id: string; name: string }[]
  purchases?: { id: string; merchant: string; addedBy: string | null }[]
}

const send = (method: string, path: string, cookie: string, body?: unknown) =>
  client.request(method, path, { body, headers: { cookie } })
const codeOf = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code
const read = async (monthKey: string, cookie: string) =>
  (await (await send('GET', `/api/food/${monthKey}?today=2026-11-18`, cookie)).json()) as Month

async function setUp(monthKey: string, cookie: string, amountBani = 150000): Promise<string> {
  const res = await send('PUT', `/api/food/${monthKey}/sources?today=2026-11-18`, cookie, {
    sources: [{ name: 'Card', amountBani }],
  })
  assert.equal(res.status, 200)
  return ((await res.json()) as Month).sources?.[0]?.id as string
}

async function buy(monthKey: string, cookie: string, sourceId: string, merchant: string): Promise<string> {
  const res = await send('POST', `/api/food/${monthKey}/purchases`, cookie, {
    merchant,
    amountBani: 5000,
    spentOn: `${monthKey}-03`,
    sourceId,
  })
  assert.equal(res.status, 201)
  return ((await res.json()) as { id: string }).id
}

async function joinFamilyOf(owner: string, member: string): Promise<void> {
  const { code } = (await (await send('POST', '/api/family/invites', owner)).json()) as { code: string }
  assert.equal((await send('POST', '/api/family/join', member, { code })).status, 201)
}

const keeperOf = (monthKey: string) =>
  db.prepare('SELECT user_id, family_id FROM food_budgets WHERE month_key = ? AND family_id IS NOT NULL').get(monthKey)
    ?.user_id

// Ana's personal month from before the family.
const anaCard = await setUp('2026-10', ana)
const anaOwnPurchase = await buy('2026-10', ana, anaCard, 'Lidl')

await send('POST', '/api/family', ana, { name: 'Popescu' })
await joinFamilyOf(ana, ion)
await send('POST', '/api/family', eva, { name: 'Ionescu' })

let card = ''
let ionPurchase = ''

describe('in a family', () => {
  test('a personal month waits until it is shared', async () => {
    assert.equal((await read('2026-10', ana)).exists, false)
    assert.equal((await send('PATCH', `/api/food/purchases/${anaOwnPurchase}`, ana, { merchant: 'X' })).status, 404)
  })

  test('a month set up by one member is every member’s', async () => {
    card = await setUp('2026-11', ana)
    const month = await read('2026-11', ion)
    assert.equal(month.shared, true)
    assert.equal(month.exists, true)
    assert.equal(keeperOf('2026-11'), idOf('Ana'))
  })

  test('each purchase says who added it', async () => {
    ionPurchase = await buy('2026-11', ion, card, 'Mega')
    await buy('2026-11', ana, card, 'Piață')
    assert.deepEqual(
      (await read('2026-11', ana)).purchases?.map((p) => [p.merchant, p.addedBy]),
      [
        ['Piață', 'Ana'],
        ['Mega', 'Ion'],
      ],
    )
  })

  test('any member changes and deletes purchases', async () => {
    assert.equal((await send('PATCH', `/api/food/purchases/${ionPurchase}`, ana, { merchant: 'Mega Image' })).status, 200)
    const other = (await read('2026-11', ion)).purchases?.find((p) => p.merchant === 'Piață')?.id as string
    assert.equal((await send('DELETE', `/api/food/purchases/${other}`, ion)).status, 200)
  })

  test('another family reaches none of it', async () => {
    assert.equal((await read('2026-11', eva)).exists, false)
    assert.equal((await send('PATCH', `/api/food/purchases/${ionPurchase}`, eva, { merchant: 'Eva' })).status, 404)
    assert.equal((await send('DELETE', `/api/food/purchases/${ionPurchase}`, eva)).status, 404)
    assert.equal((await send('DELETE', '/api/food/2026-11/purchases', eva)).status, 404)
    assert.equal((await send('DELETE', '/api/food/2026-11', eva)).status, 404)
    // Eva's family can have its own November.
    await setUp('2026-11', eva)
    assert.equal((await read('2026-11', ana)).purchases?.length, 1)
  })

  test('someone in no family sees only their own months', async () => {
    assert.equal((await read('2026-11', dan)).exists, false)
    assert.equal((await read('2026-11', dan)).shared, false)
  })
})

describe('when a member leaves', () => {
  test('they lose the family’s months, which stay, with the purchases they added', async () => {
    const decemberCard = await setUp('2026-12', ion)
    await buy('2026-12', ion, decemberCard, 'Profi')
    await send('POST', '/api/family/leave', ion)

    assert.equal((await read('2026-11', ion)).exists, false)
    assert.equal((await send('DELETE', `/api/food/purchases/${ionPurchase}`, ion)).status, 404)
    assert.deepEqual(
      (await read('2026-12', ana)).purchases?.map((p) => [p.merchant, p.addedBy]),
      [['Profi', 'Ion']],
    )
  })

  test('the months they kept are kept by the owner', () => {
    assert.equal(keeperOf('2026-12'), idOf('Ana'))
  })
})

describe('when the last member leaves', () => {
  test('a month that clashes with a personal one stops them', async () => {
    await setUp('2026-10', ana)
    const res = await send('POST', '/api/family/leave', ana)
    assert.equal(res.status, 409)
    assert.equal(await codeOf(res), 'family_dissolve_conflicts')
  })

  test('the family’s months become theirs', async () => {
    // Settled by hand here; the sharing endpoints do it for real.
    db.prepare("DELETE FROM food_budgets WHERE month_key = '2026-10' AND family_id IS NULL AND user_id = ?").run(idOf('Ana'))
    const res = await send('POST', '/api/family/leave', ana)
    assert.deepEqual(await res.json(), { ok: true, dissolved: true })
    const month = await read('2026-12', ana)
    assert.equal(month.shared, false)
    assert.equal(month.purchases?.[0]?.addedBy, 'Ion')
  })
})

describe('deleting an account', () => {
  const deleteAccount = async (cookie: string) => {
    await send('POST', '/api/auth/confirm-password', cookie, { password: TEST_PASSWORD })
    assert.equal((await send('DELETE', '/api/user', cookie)).status, 200)
  }

  test('of a member leaves the months they kept with the family', async () => {
    await joinFamilyOf(eva, dan)
    const danCard = await setUp('2027-01', dan)
    await buy('2027-01', dan, danCard, 'Carrefour')
    await deleteAccount(dan)
    assert.equal(keeperOf('2027-01'), idOf('Eva'))
    assert.deepEqual(
      (await read('2027-01', eva)).purchases?.map((p) => p.addedBy),
      [null],
    )
  })

  test('of the last member deletes the family’s months', async () => {
    await deleteAccount(eva)
    assert.equal(db.prepare('SELECT count(*) AS n FROM food_budgets WHERE family_id IS NOT NULL').get()?.n, 0)
    assert.equal(db.prepare('SELECT count(*) AS n FROM families').get()?.n, 0)
  })
})
