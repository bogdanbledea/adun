import assert from 'node:assert/strict'
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
const anaId = (db.prepare("SELECT id FROM users WHERE email = 'ana@example.com'").get() as { id: string }).id

interface Month {
  categories: { name: string; entries: { description: string; type: string; amountBani: number }[] }[]
  totals: { incomeBani: number; expenseBani: number; balanceBani: number }
}

const send = (method: string, path: string, cookie: string, body?: unknown) =>
  client.request(method, path, { body, headers: { cookie } })
const codeOf = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code
const readMonth = async (monthKey: string, cookie = ana) =>
  (await (await send('GET', `/api/months/${monthKey}`, cookie)).json()) as Month
const layout = (month: Month) =>
  month.categories.map((category) => [category.name, category.entries.map((entry) => entry.description)])
const lastActivity = () => {
  const row = db.prepare('SELECT action, metadata FROM activity_logs WHERE user_id = ? ORDER BY id DESC').get(anaId)
  return { action: row?.action, metadata: JSON.parse(row?.metadata as string) as unknown }
}
const createFrom = (monthKey: string, from: string, cookie = ana) =>
  send('POST', '/api/months', cookie, { monthKey, from })
const importInto = (monthKey: string, from: string, cookie = ana) =>
  send('POST', `/api/months/${monthKey}/import`, cookie, { from })

async function add(monthKey: string | null, categoryName: string, description: string, amountBani = 1000, cookie = ana) {
  const path = monthKey === null ? '/api/template/entries' : '/api/entries'
  const type = categoryName === 'Salary' ? 'income' : 'expense'
  const res = await send('POST', path, cookie, { monthKey: monthKey ?? undefined, categoryName, description, type, amountBani })
  assert.equal(res.status, 201)
}

await send('POST', '/api/months', ana, { monthKey: '2026-01' })
await add('2026-01', 'Salary', 'Salary', 650_000)
await add('2026-01', 'Home', 'Rent', 150_000)
await add('2026-01', 'Home', 'Electricity', 25_000)
await add(null, 'Home', 'Rent', 150_000)
await add(null, 'Car', 'Insurance', 12_000)

describe('POST /api/months with a source', () => {
  test('copies another month: its categories and entries, in order', async () => {
    const res = await createFrom('2026-02', '2026-01')
    assert.equal(res.status, 201)
    const month = (await res.json()) as Month
    assert.deepEqual(layout(month), [
      ['Salary', ['Salary']],
      ['Home', ['Rent', 'Electricity']],
    ])
    assert.deepEqual(month.totals, { incomeBani: 650_000, expenseBani: 175_000, balanceBani: 475_000 })
    assert.deepEqual(lastActivity(), {
      action: 'month.created',
      metadata: { monthKey: '2026-02', from: '2026-01', entries: 3 },
    })
  })

  test('the copy is its own: changing it leaves the source alone', async () => {
    await add('2026-02', 'Home', 'Water')
    assert.deepEqual(layout(await readMonth('2026-01'))[1], ['Home', ['Rent', 'Electricity']])
  })

  test('copies the template', async () => {
    const res = await createFrom('2026-03', 'template')
    assert.equal(res.status, 201)
    assert.deepEqual(layout((await res.json()) as Month), [
      ['Home', ['Rent']],
      ['Car', ['Insurance']],
    ])
    assert.deepEqual(lastActivity(), {
      action: 'month.created',
      metadata: { monthKey: '2026-03', from: 'template', entries: 2 },
    })
  })

  test('an empty template gives an empty month', async () => {
    const res = await createFrom('2026-01', 'template', ion)
    assert.equal(res.status, 201)
    assert.deepEqual(layout((await res.json()) as Month), [])
  })

  test('a source month that does not exist, or is another user’s, is not found', async () => {
    for (const [from, cookie] of [
      ['2025-12', ana],
      ['2026-02', ion],
    ] as const) {
      const res = await createFrom('2026-06', from, cookie)
      assert.equal(res.status, 404)
      assert.equal(await codeOf(res), 'month_not_found')
    }
    assert.deepEqual(await (await send('GET', '/api/months', ana)).json(), ['2026-01', '2026-02', '2026-03'])
  })

  test('a month that exists is not created again', async () => {
    const res = await createFrom('2026-01', 'template')
    assert.equal(res.status, 409)
    assert.equal(await codeOf(res), 'month_exists')
  })

  test('the source is a month key or "template"', async () => {
    for (const from of ['sablon', '2026-13', '', 7]) {
      const res = await send('POST', '/api/months', ana, { monthKey: '2026-07', from })
      assert.equal(res.status, 400, String(from))
    }
  })
})

describe('POST /api/months/:monthKey/import', () => {
  test('appends the entries to the month’s categories of the same name, new ones last', async () => {
    const res = await importInto('2026-01', 'template')
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), { imported: 2 })
    assert.deepEqual(layout(await readMonth('2026-01')), [
      ['Salary', ['Salary']],
      ['Home', ['Rent', 'Electricity', 'Rent']],
      ['Car', ['Insurance']],
    ])
    assert.deepEqual(lastActivity(), {
      action: 'month.imported',
      metadata: { monthKey: '2026-01', from: 'template', entries: 2 },
    })
  })

  test('imports another month', async () => {
    const res = await importInto('2026-03', '2026-02')
    assert.deepEqual(await res.json(), { imported: 4 })
    assert.deepEqual(layout(await readMonth('2026-03')), [
      ['Home', ['Rent', 'Rent', 'Electricity', 'Water']],
      ['Car', ['Insurance']],
      ['Salary', ['Salary']],
    ])
  })

  test('an empty template imports nothing', async () => {
    const res = await importInto('2026-01', 'template', ion)
    assert.deepEqual(await res.json(), { imported: 0 })
  })

  test('the month and the source month must exist and be the caller’s', async () => {
    const missing = await importInto('2027-01', 'template')
    assert.equal(missing.status, 404)
    assert.equal(await codeOf(missing), 'month_not_found')

    const theirs = await importInto('2026-01', '2026-02', ion)
    assert.equal(theirs.status, 404)
    assert.deepEqual(layout(await readMonth('2026-01', ion)), [])
  })

  test('a month is not imported into itself', async () => {
    const res = await importInto('2026-01', '2026-01')
    assert.equal(res.status, 400)
    assert.equal(await codeOf(res), 'same_month')
  })

  test('an import that would pass a limit changes nothing', async () => {
    const target = db.prepare("SELECT id FROM months WHERE user_id = ? AND month_key = '2026-02'").get(anaId) as {
      id: string
    }
    const home = db.prepare("SELECT id FROM categories WHERE month_id = ? AND name = 'Home'").get(target.id) as {
      id: string
    }
    const count = () => db.prepare('SELECT count(*) AS n FROM entries WHERE month_id = ?').get(target.id)?.n as number
    transaction(db, () => {
      const insert = db.prepare(
        `INSERT INTO entries (id, user_id, month_id, category_id, description, type, amount_bani, created_at)
         VALUES (lower(hex(randomblob(16))), ?, ?, ?, 'Filler', 'expense', 1, '2026-01-01T00:00:00Z')`,
      )
      for (let n = count(); n < LIMITS.entriesPerMonth - 1; n++) insert.run(anaId, target.id, home.id)
    })
    const before = layout(await readMonth('2026-02'))
    const activities = () => db.prepare('SELECT count(*) AS n FROM activity_logs WHERE user_id = ?').get(anaId)?.n
    const activitiesBefore = activities()

    const res = await importInto('2026-02', 'template')
    assert.equal(res.status, 409)
    assert.equal(await codeOf(res), 'limit_reached')
    assert.deepEqual(layout(await readMonth('2026-02')), before)
    assert.equal(activities(), activitiesBefore)
  })
})
