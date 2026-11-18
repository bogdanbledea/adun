import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { appClient, createUser, signIn } from '../../../test/auth.ts'
import { tempDatabase } from '../../../test/helpers.ts'
import { LIMITS } from '../../lib/limits.ts'
import { addMonths, splitInstallments } from './service.ts'

const { db, dataDir } = tempDatabase()
await createUser(db, 'ana@example.com')
await createUser(db, 'ion@example.com', 'Ion Ionescu')

const client = await appClient(db, dataDir)
const ana = await signIn(client, 'ana@example.com')
const ion = await signIn(client, 'ion@example.com')
const anaId = (db.prepare("SELECT id FROM users WHERE email = 'ana@example.com'").get() as { id: string }).id

interface Plan {
  id: string
  installmentCount: number
  totalBani: number
  installmentBani: number
  paidInstallments: number
  remainingInstallments: number
  installments?: { index: number; monthKey: string; amountBani: number; paid: boolean }[]
}

const send = (method: string, path: string, cookie: string, body?: unknown) =>
  client.request(method, path, { body, headers: { cookie } })
const codeOf = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code
const plan = (fields: Record<string, unknown> = {}) => ({
  name: 'Phone',
  installmentCount: 3,
  totalBani: 200_000,
  firstMonthKey: '2026-11',
  categoryName: 'Instalments',
  ...fields,
})
const create = (fields: Record<string, unknown> = {}, cookie = ana) =>
  send('POST', '/api/plans?month=2026-12', cookie, plan(fields))
const readPlan = async (id: string, month = '2026-12') =>
  (await (await send('GET', `/api/plans/${id}?month=${month}`, ana)).json()) as Plan

test('a total is split in whole bani, the first instalment taking the remainder', () => {
  assert.deepEqual(splitInstallments(200_000, 3), [66_668, 66_666, 66_666])
  assert.deepEqual(splitInstallments(100, 1), [100])
  assert.deepEqual(splitInstallments(2, 3), [2, 0, 0])
})

test('months are counted across years', () => {
  assert.equal(addMonths('2026-11', 2), '2027-01')
  assert.equal(addMonths('2026-01', 0), '2026-01')
  assert.equal(addMonths('9999-01', 11), '9999-12')
})

describe('creating a plan', () => {
  test('puts one expense in each of its months, creating the months', async () => {
    await send('POST', '/api/months', ana, { monthKey: '2026-11' })
    await send('POST', '/api/entries', ana, {
      monthKey: '2026-11',
      categoryName: 'Instalments',
      description: 'Car',
      type: 'expense',
      amountBani: 50_000,
    })

    const res = await create()
    assert.equal(res.status, 201)
    const created = (await res.json()) as Plan
    assert.equal(created.installmentBani, 66_666)
    assert.deepEqual([created.paidInstallments, created.remainingInstallments], [2, 1])

    const detail = await readPlan(created.id)
    assert.deepEqual(detail.installments?.map(({ index, monthKey, amountBani, paid }) => [index, monthKey, amountBani, paid]), [
      [1, '2026-11', 66_668, true],
      [2, '2026-12', 66_666, true],
      [3, '2027-01', 66_666, false],
    ])

    const months = (await (await send('GET', '/api/months', ana)).json()) as string[]
    assert.deepEqual(months, ['2026-11', '2026-12', '2027-01'])
    // The month's own category is used, and the instalment goes after its entries.
    const november = (await (await send('GET', '/api/months/2026-11', ana)).json()) as {
      categories: { name: string; entries: { description: string }[] }[]
    }
    assert.deepEqual(november.categories.map((c) => [c.name, c.entries.map((e) => e.description)]), [
      ['Instalments', ['Car', 'Phone']],
    ])
  })

  test('is recorded in the activity history', async () => {
    await create({ name: 'Laptop', installmentCount: 2, totalBani: 300_000 })
    const row = db.prepare('SELECT action, metadata FROM activity_logs WHERE user_id = ? ORDER BY id DESC').get(anaId)
    assert.equal(row?.action, 'plan.created')
    assert.deepEqual(JSON.parse(row.metadata as string), {
      name: 'Laptop',
      installments: 2,
      totalBani: 300_000,
      firstMonthKey: '2026-11',
    })
  })

  test('refuses impossible values', async () => {
    for (const fields of [
      { name: ' ' },
      { installmentCount: 0 },
      { installmentCount: 361 },
      { totalBani: 0 },
      { totalBani: 1.5 },
      { firstMonthKey: '2026-13' },
      { purchaseDate: '20.12.2025' },
      // The last instalment would fall after 9999-12.
      { firstMonthKey: '9999-11', installmentCount: 3 },
    ]) {
      const res = await create(fields)
      assert.equal(res.status, 400, JSON.stringify(fields))
    }
    assert.equal((await send('POST', '/api/plans', ana, plan())).status, 400)
  })

  test('adds nothing when a month would pass its limit on entries', async () => {
    const before = db.prepare('SELECT count(*) AS n FROM payment_plans').get()?.n
    const month = db.prepare("SELECT id FROM months WHERE month_key = '2026-12' AND user_id = ?").get(anaId)?.id as string
    const category = db.prepare('SELECT id FROM categories WHERE month_id = ?').get(month)?.id as string
    const insert = db.prepare(
      `INSERT INTO entries (id, user_id, month_id, category_id, description, type, amount_bani, created_at)
       VALUES (?, ?, ?, ?, 'Filler', 'expense', 1, ?)`,
    )
    const count = db.prepare('SELECT count(*) AS n FROM entries WHERE month_id = ?').get(month)?.n as number
    for (let i = count; i < LIMITS.entriesPerMonth; i++) {
      insert.run(crypto.randomUUID(), anaId, month, category, new Date().toISOString())
    }

    const res = await create({ name: 'Fridge' })
    assert.equal(res.status, 409)
    assert.equal(await codeOf(res), 'limit_reached')
    assert.equal(db.prepare('SELECT count(*) AS n FROM payment_plans').get()?.n, before)
    assert.equal(db.prepare("SELECT count(*) AS n FROM entries WHERE description = 'Fridge'").get()?.n, 0)
    db.prepare("DELETE FROM entries WHERE description = 'Filler'").run()
  })
})

describe('reading plans', () => {
  test('lists them newest first, with the instalments paid by the given month', async () => {
    const res = await send('GET', '/api/plans?month=2027-01', ana)
    const list = (await res.json()) as (Plan & { name: string })[]
    assert.deepEqual(list.map((p) => [p.name, p.paidInstallments, p.remainingInstallments]), [
      ['Laptop', 2, 0],
      ['Phone', 3, 0],
    ])
  })

  test('need the current month', async () => {
    assert.equal((await send('GET', '/api/plans', ana)).status, 400)
    assert.equal((await send('GET', '/api/plans?month=2027', ana)).status, 400)
  })

  test('are not found for another user', async () => {
    const [own] = (await (await send('GET', '/api/plans?month=2027-01', ana)).json()) as Plan[]
    const res = await send('GET', `/api/plans/${String(own?.id)}?month=2027-01`, ion)
    assert.equal(res.status, 404)
    assert.equal(await codeOf(res), 'plan_not_found')
    assert.deepEqual(await (await send('GET', '/api/plans?month=2027-01', ion)).json(), [])
  })
})

describe('closing and deleting a plan', () => {
  const planNamed = (name: string) =>
    db.prepare('SELECT id FROM payment_plans WHERE name = ? AND user_id = ?').get(name, anaId)?.id as string
  const installmentsOf = (id: string) =>
    (db.prepare('SELECT count(*) AS n FROM entries WHERE plan_id = ?').get(id)?.n as number)

  test('the purchase date can be set and cleared', async () => {
    const id = planNamed('Phone')
    const set = await send('PATCH', `/api/plans/${id}?month=2026-12`, ana, { purchaseDate: '2026-10-20' })
    assert.equal(((await set.json()) as { purchaseDate: string }).purchaseDate, '2026-10-20')
    const cleared = await send('PATCH', `/api/plans/${id}?month=2026-12`, ana, { purchaseDate: null })
    assert.equal(((await cleared.json()) as { purchaseDate: null }).purchaseDate, null)
    assert.equal((await send('PATCH', `/api/plans/${id}?month=2026-12`, ana, { purchaseDate: 'soon' })).status, 400)
  })

  test('an open plan cannot be deleted', async () => {
    const res = await send('DELETE', `/api/plans/${planNamed('Phone')}`, ana)
    assert.equal(res.status, 409)
    assert.equal(await codeOf(res), 'plan_open')
  })

  test('closing deletes the instalments after the current month, and the categories they leave empty', async () => {
    const id = planNamed('Phone')
    const res = await send('POST', `/api/plans/${id}/close?month=2026-12`, ana)
    assert.equal(res.status, 200)
    const closed = (await res.json()) as Plan & { closedAt: string | null }
    assert.notEqual(closed.closedAt, null)
    assert.deepEqual([closed.paidInstallments, closed.remainingInstallments], [2, 0])
    assert.equal(installmentsOf(id), 2)
    const january = db.prepare("SELECT id FROM months WHERE month_key = '2027-01' AND user_id = ?").get(anaId)?.id as string
    assert.equal(db.prepare("SELECT count(*) AS n FROM entries WHERE month_id = ? AND description = 'Phone'").get(january)?.n, 0)

    const row = db.prepare('SELECT action, metadata FROM activity_logs WHERE user_id = ? ORDER BY id DESC').get(anaId)
    assert.deepEqual([row?.action, JSON.parse(row?.metadata as string)], ['plan.closed', { name: 'Phone', deletedInstallments: 1 }])

    // Closing again changes nothing.
    await send('POST', `/api/plans/${id}/close?month=2027-01`, ana)
    assert.equal(installmentsOf(id), 2)
  })

  test('a closed plan is deleted with every instalment', async () => {
    const id = planNamed('Phone')
    assert.equal((await send('DELETE', `/api/plans/${id}`, ana)).status, 200)
    assert.equal(installmentsOf(id), 0)
    assert.equal((await send('GET', `/api/plans/${id}?month=2026-12`, ana)).status, 404)
    // November keeps its own entry; December had only the instalment.
    const categories = db
      .prepare("SELECT m.month_key FROM categories c JOIN months m ON m.id = c.month_id WHERE c.user_id = ? AND c.name = 'Instalments'")
      .all(anaId)
      .map((row) => row.month_key)
    assert.ok(categories.includes('2026-11'))
    const row = db.prepare('SELECT action, metadata FROM activity_logs WHERE user_id = ? ORDER BY id DESC').get(anaId)
    assert.deepEqual([row?.action, JSON.parse(row?.metadata as string)], ['plan.deleted', { name: 'Phone', deletedInstallments: 2 }])
  })

  test("another user's plan is not found", async () => {
    const id = planNamed('Laptop')
    for (const res of [
      await send('PATCH', `/api/plans/${id}?month=2026-12`, ion, { purchaseDate: null }),
      await send('POST', `/api/plans/${id}/close?month=2026-12`, ion),
      await send('DELETE', `/api/plans/${id}`, ion),
    ]) {
      assert.equal(res.status, 404)
    }
    assert.equal(installmentsOf(id), 2)
  })
})

describe('instalments in the budget', () => {
  interface MonthEntry {
    id: string
    description: string
    plan: { name: string; index: number; total: number } | null
  }
  const entriesOf = async (monthKey: string) =>
    ((await (await send('GET', `/api/months/${monthKey}`, ana)).json()) as { categories: { entries: MonthEntry[] }[] })
      .categories.flatMap((category) => category.entries)

  test('show their plan and number', async () => {
    await create({ name: 'Bike', installmentCount: 2, firstMonthKey: '2028-01' })
    const [installment] = await entriesOf('2028-01')
    assert.deepEqual(installment?.plan && { ...installment.plan, id: undefined }, { id: undefined, name: 'Bike', index: 1, total: 2 })
  })

  test('can be edited but not moved or made income', async () => {
    const [installment] = await entriesOf('2028-01')
    const path = `/api/entries/${String(installment?.id)}`
    assert.equal((await send('PATCH', path, ana, { amountBani: 90_000 })).status, 200)
    for (const [body, code] of [
      [{ monthKey: '2028-03' }, 'installment_move'],
      [{ type: 'income' }, 'installment_type'],
    ] as const) {
      const res = await send('PATCH', path, ana, body)
      assert.equal(res.status, 400)
      assert.equal(await codeOf(res), code)
    }
  })

  test('are left out of copies and imports', async () => {
    await send('POST', '/api/entries', ana, {
      monthKey: '2028-01',
      categoryName: 'Home',
      description: 'Rent',
      type: 'expense',
      amountBani: 150_000,
    })
    await send('POST', '/api/months', ana, { monthKey: '2028-05', from: '2028-01' })
    assert.deepEqual((await entriesOf('2028-05')).map((entry) => entry.description), ['Rent'])
    await send('POST', '/api/months/2028-05/import', ana, { from: '2028-02' })
    assert.deepEqual((await entriesOf('2028-05')).map((entry) => entry.description), ['Rent'])
  })

  test('keep their month when it is deleted, which loses only its own entries', async () => {
    const res = await send('DELETE', '/api/months/2028-01', ana)
    assert.deepEqual(await res.json(), { ok: true, cleared: true, keptInstallments: 1 })
    assert.deepEqual((await entriesOf('2028-01')).map((entry) => entry.description), ['Bike'])
    const row = db.prepare('SELECT action, metadata FROM activity_logs WHERE user_id = ? ORDER BY id DESC').get(anaId)
    assert.deepEqual([row?.action, JSON.parse(row?.metadata as string)], [
      'month.cleared',
      { monthKey: '2028-01', entries: 1, keptInstallments: 1 },
    ])
    // A month without instalments still goes.
    assert.deepEqual(await (await send('DELETE', '/api/months/2028-05', ana)).json(), {
      ok: true,
      cleared: false,
      keptInstallments: 0,
    })
  })
})
