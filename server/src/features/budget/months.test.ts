import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { describe, test } from 'node:test'
import { appClient, createUser, signIn } from '../../../test/auth.ts'
import { tempDatabase } from '../../../test/helpers.ts'
import { transaction } from '../../db.ts'
import { LIMITS } from '../../lib/limits.ts'

const { db, dataDir } = tempDatabase()
await createUser(db, 'ana@example.com')
await createUser(db, 'ion@example.com', 'Ion Ionescu')

const client = await appClient(db, dataDir)
const ana = await signIn(client, 'ana@example.com')
const ion = await signIn(client, 'ion@example.com')

const idOf = (email: string) => (db.prepare('SELECT id FROM users WHERE email = ?').get(email) as { id: string }).id
const anaId = idOf('ana@example.com')

const send = (method: string, path: string, cookie: string | null, body?: unknown) =>
  client.request(method, `/api/months${path}`, { body, headers: cookie ? { cookie } : {} })
const create = (monthKey: unknown, cookie = ana) => send('POST', '', cookie, { monthKey })
const codeOf = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code
const actions = () =>
  db
    .prepare('SELECT action, metadata FROM activity_logs WHERE user_id = ? ORDER BY id')
    .all(anaId)
    .map((row) => ({ action: row.action, metadata: JSON.parse(row.metadata as string) as unknown }))

// Entries go in through SQL here; their own endpoints have their own tests.
function addEntry(monthKey: string, categoryName: string, type: string, amountBani: number) {
  const month = db.prepare('SELECT id FROM months WHERE user_id = ? AND month_key = ?').get(anaId, monthKey)
  const monthId = month?.id as string
  let category = db.prepare('SELECT id FROM categories WHERE month_id = ? AND name = ?').get(monthId, categoryName)
  if (!category) {
    category = { id: randomUUID() }
    db.prepare('INSERT INTO categories (id, user_id, month_id, name, sort_order) VALUES (?, ?, ?, ?, ?)').run(
      category.id as string,
      anaId,
      monthId,
      categoryName,
      categoryName === 'Home' ? 0 : 1,
    )
  }
  db.prepare(
    `INSERT INTO entries (id, user_id, month_id, category_id, description, type, amount_bani, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(randomUUID(), anaId, monthId, category.id as string, `${type} ${String(amountBani)}`, type, amountBani, new Date().toISOString())
}

describe('POST /api/months', () => {
  test('creates an empty month and records it', async () => {
    const res = await create('2026-02')
    assert.equal(res.status, 201)
    assert.deepEqual(await res.json(), {
      monthKey: '2026-02',
      categories: [],
      totals: { incomeBani: 0, expenseBani: 0, balanceBani: 0 },
    })
    assert.deepEqual(actions().at(-1), { action: 'month.created', metadata: { monthKey: '2026-02' } })
  })

  test('refuses a month that already has a budget', async () => {
    const res = await create('2026-02')
    assert.equal(res.status, 409)
    assert.equal(await codeOf(res), 'month_exists')
  })

  test('lets another user have the same month', async () => {
    assert.equal((await create('2026-02', ion)).status, 201)
  })

  test('rejects a key that is not a month', async () => {
    for (const key of ['2026-13', '2026-00', '2026-1', '202602', 202602, null]) {
      assert.equal((await create(key)).status, 400, String(key))
    }
  })

  test(`stops at ${String(LIMITS.months)} months per account`, async () => {
    await createUser(db, 'maria@example.com', 'Maria Pop')
    const mariaId = idOf('maria@example.com')
    const maria = await signIn(client, 'maria@example.com')
    const insert = db.prepare('INSERT INTO months (id, user_id, month_key, created_at) VALUES (?, ?, ?, ?)')
    transaction(db, () => {
      for (let i = 0; i < LIMITS.months; i++) {
        const key = `${String(1900 + Math.floor(i / 12))}-${String((i % 12) + 1).padStart(2, '0')}`
        insert.run(randomUUID(), mariaId, key, new Date().toISOString())
      }
    })
    const res = await create('2099-01', maria)
    assert.equal(res.status, 409)
    assert.equal(await codeOf(res), 'limit_reached')
    assert.equal(db.prepare("SELECT 1 FROM months WHERE month_key = '2099-01'").get(), undefined)
  })
})

describe('GET /api/months', () => {
  test('lists the caller’s months, oldest first', async () => {
    await create('2025-12')
    const res = await send('GET', '', ana)
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), ['2025-12', '2026-02'])
  })

  test('needs a session', async () => {
    assert.equal((await send('GET', '', null)).status, 401)
  })
})

describe('GET /api/months/:monthKey', () => {
  test('returns the categories in order with their entries, and the totals', async () => {
    await create('2026-03')
    addEntry('2026-03', 'Salary', 'income', 650_000)
    addEntry('2026-03', 'Home', 'expense', 150_000)
    addEntry('2026-03', 'Home', 'expense', 30_050)

    const res = await send('GET', '/2026-03', ana)
    assert.equal(res.status, 200)
    const month = (await res.json()) as {
      categories: { name: string; entries: { description: string; type: string; amountBani: number }[] }[]
      totals: unknown
    }
    assert.deepEqual(
      month.categories.map((category) => [category.name, category.entries.map((entry) => entry.amountBani)]),
      [
        ['Home', [150_000, 30_050]],
        ['Salary', [650_000]],
      ],
    )
    assert.deepEqual(Object.keys(month.categories[0]?.entries[0] ?? {}).sort(), ['amountBani', 'description', 'id', 'type'])
    assert.deepEqual(month.totals, { incomeBani: 650_000, expenseBani: 180_050, balanceBani: 469_950 })
  })

  test('is a 404 for a month without a budget, and for another user', async () => {
    for (const [path, cookie] of [['/2030-01', ana], ['/2026-03', ion]] as const) {
      const res = await send('GET', path, cookie)
      assert.equal(res.status, 404)
      assert.equal(await codeOf(res), 'month_not_found')
    }
  })

  test('rejects a key that is not a month', async () => {
    assert.equal((await send('GET', '/2026-3', ana)).status, 400)
  })
})

describe('DELETE /api/months/:monthKey', () => {
  test('removes the month with its entries and records how many went', async () => {
    const res = await send('DELETE', '/2026-03', ana)
    assert.equal(res.status, 200)
    assert.equal((await send('GET', '/2026-03', ana)).status, 404)
    assert.equal(db.prepare('SELECT count(*) AS n FROM entries WHERE user_id = ?').get(anaId)?.n, 0)
    assert.deepEqual(actions().at(-1), { action: 'month.deleted', metadata: { monthKey: '2026-03', entries: 3 } })
  })

  test('is a 404 for another user’s month, which stays', async () => {
    const res = await send('DELETE', '/2026-02', ion)
    assert.equal(res.status, 200, 'Ion’s own 2026-02 goes')
    assert.equal((await send('GET', '/2026-02', ana)).status, 200, 'Ana’s stays')
    assert.equal((await send('DELETE', '/2025-12', ion)).status, 404)
    assert.equal((await send('GET', '/2025-12', ana)).status, 200)
  })
})
