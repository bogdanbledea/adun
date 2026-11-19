import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { appClient, createUser, signIn } from '../../../test/auth.ts'
import { tempDatabase } from '../../../test/helpers.ts'

const { db, dataDir } = tempDatabase()
await createUser(db, 'ana@example.com')
await createUser(db, 'ion@example.com', 'Ion Ionescu')

const client = await appClient(db, dataDir)
const ana = await signIn(client, 'ana@example.com')
const ion = await signIn(client, 'ion@example.com')
const anaId = (db.prepare("SELECT id FROM users WHERE email = 'ana@example.com'").get() as { id: string }).id

interface Source {
  id: string
  name: string
  amountBani: number
}

interface Month {
  monthKey: string
  period: { start: string; end: string }
  exists: boolean
  totalBani?: number
  sources?: Source[]
  suggestedFrom?: string | null
  suggestedSources?: { name: string; amountBani: number }[]
}

const send = (method: string, path: string, cookie: string, body?: unknown) =>
  client.request(method, path, { body, headers: { cookie } })
const codeOf = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code
const read = async (monthKey: string, cookie = ana) => (await (await send('GET', `/api/food/${monthKey}?today=2026-11-18`, cookie)).json()) as Month
const save = (monthKey: string, sources: unknown[], { today = '2026-11-18', cookie = ana } = {}) =>
  send('PUT', `/api/food/${monthKey}/sources?today=${today}`, cookie, { sources })
const saved = async (monthKey: string, sources: unknown[], options?: { today?: string }) => {
  const res = await save(monthKey, sources, options)
  assert.equal(res.status, 200)
  return (await res.json()) as Month
}
const lastActivity = () =>
  db.prepare('SELECT action, metadata FROM activity_logs WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(anaId)
const planFrom = (monthKey: string) =>
  db.prepare('SELECT plan_from FROM food_budgets WHERE user_id = ? AND month_key = ?').get(anaId, monthKey)?.plan_from

describe('a month without a budget', () => {
  test('answers its period, the calendar month', async () => {
    assert.deepEqual(await read('2026-02'), {
      monthKey: '2026-02',
      period: { start: '2026-02-01', end: '2026-02-28', ruleStart: '2026-02-01', rule: 'calendar' },
      shared: false,
      exists: false,
      suggestedFrom: null,
      suggestedSources: [],
    })
  })

  test('suggests the sources of the latest earlier budget', async () => {
    await saved('2025-03', [{ name: 'Card', amountBani: 100000 }])
    await saved('2025-04', [{ name: 'Card', amountBani: 150000 }, { name: 'Tichete', amountBani: 60000 }])
    const month = await read('2025-07')
    assert.equal(month.suggestedFrom, '2025-04')
    assert.deepEqual(month.suggestedSources, [
      { name: 'Card', amountBani: 150000 },
      { name: 'Tichete', amountBani: 60000 },
    ])
    assert.equal((await read('2025-03')).exists, true)
    assert.equal((await read('2025-02')).suggestedFrom, null)
  })

  test('is only from 2024 to 2099', async () => {
    for (const monthKey of ['2023-12', '2100-01', '2026-13']) {
      const res = await send('GET', `/api/food/${monthKey}`, ana)
      assert.equal(res.status, 400, monthKey)
      assert.equal(await codeOf(res), 'invalid_input')
    }
    assert.equal((await read('2099-12')).period.end, '2099-12-31')
  })
})

describe('saving the sources', () => {
  test('creates the budget, in the order given, and records it', async () => {
    const month = await saved('2026-11', [
      { name: 'Card', amountBani: 150000 },
      { name: ' Cash ', amountBani: 20000 },
    ])
    assert.equal(month.exists, true)
    assert.equal(month.totalBani, 170000)
    assert.deepEqual(month.sources?.map((s) => [s.name, s.amountBani]), [['Card', 150000], ['Cash', 20000]])
    assert.deepEqual({ ...lastActivity() }, {
      action: 'food.budget_set',
      metadata: JSON.stringify({ monthKey: '2026-11', totalBani: 170000, sources: 2 }),
    })
  })

  test('changes, adds and removes sources as one list', async () => {
    const before = await saved('2026-10', [{ name: 'Card', amountBani: 100000 }, { name: 'Cash', amountBani: 5000 }])
    const [card] = before.sources ?? []
    const after = await saved('2026-10', [
      { name: 'Tichete', amountBani: 40000 },
      { id: card?.id, name: 'Card Revolut', amountBani: 120000 },
    ])
    assert.deepEqual(after.sources?.map((s) => s.name), ['Tichete', 'Card Revolut'])
    assert.equal(after.sources[1]?.id, card?.id)
    assert.equal(after.totalBani, 160000)
  })

  test('starts the weekly plan on the client’s date, or the first day of a month set up later', async () => {
    await saved('2026-09', [{ name: 'Card', amountBani: 1 }], { today: '2026-09-12' })
    assert.equal(planFrom('2026-09'), '2026-09-12')
    await saved('2026-08', [{ name: 'Card', amountBani: 1 }], { today: '2026-11-18' })
    assert.equal(planFrom('2026-08'), '2026-08-01')
    await saved('2027-01', [{ name: 'Card', amountBani: 1 }], { today: '2026-11-18' })
    assert.equal(planFrom('2027-01'), '2027-01-01')
    // A later save keeps it.
    await saved('2026-09', [{ name: 'Card', amountBani: 2 }], { today: '2026-09-20' })
    assert.equal(planFrom('2026-09'), '2026-09-12')
  })

  test('refuses two sources with the same name, ignoring case', async () => {
    const res = await save('2026-12', [{ name: 'Card', amountBani: 1 }, { name: 'card', amountBani: 2 }])
    assert.equal(res.status, 400)
    assert.equal(await codeOf(res), 'food_duplicate_source')
    assert.equal((await read('2026-12')).exists, false)
  })

  test('refuses an empty list, more than 10 sources and amounts above 1,000,000 lei', async () => {
    const many = Array.from({ length: 11 }, (_, i) => ({ name: `Card ${String(i)}`, amountBani: 1 }))
    for (const sources of [[], many, [{ name: 'Card', amountBani: 100_000_001 }], [{ name: ' ', amountBani: 1 }]]) {
      assert.equal((await save('2026-12', sources)).status, 400)
    }
  })

  test('needs the client’s date', async () => {
    const res = await send('PUT', '/api/food/2026-12/sources', ana, { sources: [{ name: 'Card', amountBani: 1 }] })
    assert.equal(res.status, 400)
  })

  test('refuses a source ID that is not in the month', async () => {
    const other = await saved('2027-02', [{ name: 'Card', amountBani: 1 }])
    const res = await save('2027-03', [{ id: other.sources?.[0]?.id, name: 'Card', amountBani: 1 }])
    assert.equal(res.status, 400)
    assert.equal(await codeOf(res), 'food_unknown_source')
    assert.equal((await read('2027-03')).exists, false)
  })

  test('keeps a source that has purchases', async () => {
    const month = await saved('2027-04', [{ name: 'Card', amountBani: 100000 }, { name: 'Cash', amountBani: 1 }])
    const cash = month.sources?.[1]
    db.prepare(
      `INSERT INTO food_purchases (id, budget_id, source_id, user_id, merchant, amount_bani, spent_on, created_at)
       SELECT 'p1', budget_id, id, ?, 'Lidl', 100, '2027-04-02', '2027-04-02T10:00:00Z' FROM food_sources WHERE id = ?`,
    ).run(anaId, cash?.id ?? '')
    const res = await save('2027-04', [month.sources?.[0]])
    assert.equal(res.status, 409)
    assert.equal(await codeOf(res), 'food_source_in_use')
    assert.equal((await read('2027-04')).sources?.length, 2)
  })
})

describe('the weekly plan', () => {
  test('is counted from the budget’s first day for the client’s date', async () => {
    await saved('2026-06', [{ name: 'Card', amountBani: 300000 }], { today: '2026-06-10' })
    const res = await send('GET', '/api/food/2026-06?today=2026-06-17', ana)
    const month = (await res.json()) as Month & {
      weeks: { start: string; allowanceBani: number; state: string; beforeStart: boolean }[]
      currentWeek: { start: string; daysLeft: number } | null
    }
    // June 2026 starts on a Monday; the plan starts on Wednesday the 10th.
    assert.deepEqual(
      month.weeks.map((w) => [w.start, w.state, w.beforeStart]),
      [
        ['2026-06-01', 'past', true],
        ['2026-06-08', 'past', false],
        ['2026-06-15', 'current', false],
        ['2026-06-22', 'future', false],
        ['2026-06-29', 'future', false],
      ],
    )
    assert.equal(month.weeks[0]?.allowanceBani, 0)
    // Nothing was spent yet, so all 3,000 lei share the 16 days left.
    assert.equal(month.weeks[2]?.allowanceBani, 131250)
    assert.deepEqual([month.currentWeek?.start, month.currentWeek?.daysLeft], ['2026-06-15', 5])
  })

  test('needs the client’s date', async () => {
    assert.equal((await send('GET', '/api/food/2026-06', ana)).status, 400)
  })
})

describe('deleting a budget', () => {
  test('removes it and records it', async () => {
    await saved('2028-01', [{ name: 'Card', amountBani: 1 }])
    const res = await send('DELETE', '/api/food/2028-01', ana)
    assert.equal(res.status, 200)
    assert.equal((await read('2028-01')).exists, false)
    assert.deepEqual({ ...lastActivity() }, { action: 'food.budget_deleted', metadata: JSON.stringify({ monthKey: '2028-01' }) })
  })

  test('of a month without one is a 404', async () => {
    const res = await send('DELETE', '/api/food/2028-02', ana)
    assert.equal(res.status, 404)
    assert.equal(await codeOf(res), 'food_budget_not_found')
  })
})

test('another user sees, changes and deletes none of the budget', async () => {
  const month = await saved('2029-05', [{ name: 'Card', amountBani: 100000 }])
  assert.equal((await read('2029-05', ion)).exists, false)
  assert.equal((await read('2029-06', ion)).suggestedFrom, null)

  // Ion's own save makes his own budget; Ana's source IDs mean nothing there.
  const res = await save('2029-05', [{ id: month.sources?.[0]?.id, name: 'Mine', amountBani: 1 }], { cookie: ion })
  assert.equal(res.status, 400)
  assert.equal((await send('DELETE', '/api/food/2029-05', ion)).status, 404)
  assert.deepEqual((await read('2029-05')).sources, month.sources)
})

test('signed out, the food budget is closed', async () => {
  assert.equal((await client.request('GET', '/api/food/2026-11')).status, 401)
})
