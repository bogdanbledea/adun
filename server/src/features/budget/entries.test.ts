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
const anaId = (db.prepare("SELECT id FROM users WHERE email = 'ana@example.com'").get() as { id: string }).id

interface SavedEntry {
  id: string
  monthKey: string
  categoryName: string
  description: string
  type: string
  amountBani: number
  paymentDate: string | null
}

interface Month {
  categories: { name: string; entries: { description: string }[] }[]
  totals: { incomeBani: number; expenseBani: number; balanceBani: number }
}

const send = (method: string, path: string, cookie: string | null, body?: unknown) =>
  client.request(method, path, { body, headers: cookie ? { cookie } : {} })
const codeOf = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code
const readMonth = async (monthKey: string, cookie = ana) =>
  (await (await send('GET', `/api/months/${monthKey}`, cookie)).json()) as Month
const layout = (month: Month) =>
  month.categories.map((category) => [category.name, category.entries.map((entry) => entry.description)])
const lastActivity = () => {
  const row = db.prepare('SELECT action, metadata FROM activity_logs WHERE user_id = ? ORDER BY id DESC').get(anaId)
  return { action: row?.action, metadata: JSON.parse(row?.metadata as string) as unknown }
}

const rent = { monthKey: '2026-01', categoryName: 'Home', description: 'Rent', type: 'expense', amountBani: 150_000 }

async function add(fields: Partial<typeof rent> & { paymentDate?: string | null } = {}, cookie = ana): Promise<SavedEntry> {
  const res = await send('POST', '/api/entries', cookie, { ...rent, ...fields })
  assert.equal(res.status, 201)
  return (await res.json()) as SavedEntry
}

await send('POST', '/api/months', ana, { monthKey: '2026-01' })
await send('POST', '/api/months', ion, { monthKey: '2026-01' })

describe('POST /api/entries', () => {
  test('adds an entry, its category, and records it', async () => {
    const entry = await add()
    assert.deepEqual({ ...entry, id: undefined }, { ...rent, id: undefined, paymentDate: null, plan: null })
    assert.deepEqual(lastActivity(), {
      action: 'entry.created',
      metadata: { description: 'Rent', category: 'Home', type: 'expense', amountBani: 150_000, monthKey: '2026-01' },
    })
  })

  test('puts entries last in a category found by name, and new categories last', async () => {
    await add({ categoryName: 'Salary', description: 'Salary', type: 'income', amountBani: 650_000 })
    await add({ description: 'Electricity', amountBani: 25_050 })
    assert.deepEqual(layout(await readMonth('2026-01')), [
      ['Home', ['Rent', 'Electricity']],
      ['Salary', ['Salary']],
    ])
  })

  test('the month totals follow', async () => {
    assert.deepEqual((await readMonth('2026-01')).totals, {
      incomeBani: 650_000,
      expenseBani: 175_050,
      balanceBani: 474_950,
    })
  })

  test('trims the text it is given', async () => {
    const entry = await add({ categoryName: '  Home ', description: ' Water  ', amountBani: 0 })
    assert.equal(entry.categoryName, 'Home')
    assert.equal(entry.description, 'Water')
  })

  test('needs a month with a budget', async () => {
    const res = await send('POST', '/api/entries', ana, { ...rent, monthKey: '2030-01' })
    assert.equal(res.status, 404)
    assert.equal(await codeOf(res), 'month_not_found')
  })

  test('rejects bad fields', async () => {
    const bad = [
      { amountBani: -1 },
      { amountBani: 10.5 },
      { amountBani: 999_999_999_901 },
      { amountBani: '100' },
      { type: 'credit' },
      { description: '   ' },
      { description: 'x'.repeat(513) },
      { categoryName: '' },
      { monthKey: '2026-13' },
    ]
    for (const fields of bad) {
      assert.equal((await send('POST', '/api/entries', ana, { ...rent, ...fields })).status, 400, JSON.stringify(fields))
    }
  })

  test(`stops at ${String(LIMITS.entriesPerMonth)} entries and ${String(LIMITS.categoriesPerMonth)} categories a month`, async () => {
    await send('POST', '/api/months', ana, { monthKey: '2026-06' })
    const month = db.prepare("SELECT id FROM months WHERE month_key = '2026-06' AND user_id = ?").get(anaId)
    const monthId = month?.id as string
    const categoryId = randomUUID()
    transaction(db, () => {
      db.prepare("INSERT INTO categories (id, user_id, month_id, name) VALUES (?, ?, ?, 'Home')").run(categoryId, anaId, monthId)
      const insert = db.prepare(
        `INSERT INTO entries (id, user_id, month_id, category_id, description, type, amount_bani, created_at)
         VALUES (?, ?, ?, ?, 'Rent', 'expense', 100, ?)`,
      )
      for (let i = 0; i < LIMITS.entriesPerMonth; i++) {
        insert.run(randomUUID(), anaId, monthId, categoryId, new Date().toISOString())
      }
    })
    const res = await send('POST', '/api/entries', ana, { ...rent, monthKey: '2026-06', categoryName: 'New' })
    assert.equal(res.status, 409)
    assert.equal(await codeOf(res), 'limit_reached')
    assert.equal(db.prepare("SELECT 1 FROM categories WHERE name = 'New'").get(), undefined, 'nothing was added')

    // One entry below the limit, and the categories up to theirs.
    db.prepare('DELETE FROM entries WHERE rowid = (SELECT max(rowid) FROM entries WHERE month_id = ?)').run(monthId)
    transaction(db, () => {
      const insert = db.prepare('INSERT INTO categories (id, user_id, month_id, name) VALUES (?, ?, ?, ?)')
      for (let i = 1; i < LIMITS.categoriesPerMonth; i++) insert.run(randomUUID(), anaId, monthId, `Category ${String(i)}`)
    })
    assert.equal((await send('POST', '/api/entries', ana, { ...rent, monthKey: '2026-06', categoryName: 'New' })).status, 409)
    assert.equal((await send('POST', '/api/entries', ana, { ...rent, monthKey: '2026-06' })).status, 201)
    await send('DELETE', '/api/months/2026-06', ana)
  })
})

describe('PATCH /api/entries/:id', () => {
  test('changes the given fields and records it', async () => {
    const entry = await add({ description: 'Internet', amountBani: 5_000 })
    const res = await send('PATCH', `/api/entries/${entry.id}`, ana, { amountBani: 6_000, type: 'expense' })
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), { ...entry, amountBani: 6_000 })
    assert.equal(lastActivity().action, 'entry.updated')
  })

  test('a new category puts the entry last there, and an emptied category goes', async () => {
    await send('POST', '/api/months', ana, { monthKey: '2026-02' })
    const a = await add({ monthKey: '2026-02', categoryName: 'Car', description: 'Fuel' })
    await add({ monthKey: '2026-02', categoryName: 'Home', description: 'Rent' })
    await send('PATCH', `/api/entries/${a.id}`, ana, { categoryName: 'Home' })
    assert.deepEqual(layout(await readMonth('2026-02')), [['Home', ['Rent', 'Fuel']]])
  })

  test('another month moves the entry there, creating that month and keeping the category name', async () => {
    const entry = await add({ monthKey: '2026-02', categoryName: 'Gifts', description: 'Flowers' })
    const res = await send('PATCH', `/api/entries/${entry.id}`, ana, { monthKey: '2026-03' })
    assert.equal(res.status, 200)
    assert.equal(((await res.json()) as SavedEntry).monthKey, '2026-03')
    assert.deepEqual(layout(await readMonth('2026-03')), [['Gifts', ['Flowers']]])
    assert.deepEqual(layout(await readMonth('2026-02')), [['Home', ['Rent', 'Fuel']]])
    assert.deepEqual(lastActivity(), {
      action: 'entry.moved',
      metadata: {
        description: 'Flowers',
        category: 'Gifts',
        type: 'expense',
        amountBani: 150_000,
        monthKey: '2026-03',
        fromMonthKey: '2026-02',
      },
    })
  })

  test('rejects an empty change or a bad field', async () => {
    const entry = await add()
    for (const body of [{}, { amountBani: -5 }, { type: 'credit' }, { monthKey: '2026-1' }]) {
      assert.equal((await send('PATCH', `/api/entries/${entry.id}`, ana, body)).status, 400, JSON.stringify(body))
    }
  })
})

describe('the payment date', () => {
  interface Paid {
    categories: { entries: { description: string; paymentDate: string | null }[] }[]
  }
  const dates = async (monthKey: string) =>
    ((await readMonth(monthKey)) as unknown as Paid).categories.flatMap((category) =>
      category.entries.map((entry) => [entry.description, entry.paymentDate]),
    )

  test('is kept, may fall in another month, and can be changed or cleared', async () => {
    const entry = await add({ description: 'Card', paymentDate: '2026-02-03' })
    assert.equal(entry.paymentDate, '2026-02-03')
    const change = (paymentDate: string | null) => send('PATCH', `/api/entries/${entry.id}`, ana, { paymentDate })
    assert.equal(((await (await change('2026-01-28')).json()) as SavedEntry).paymentDate, '2026-01-28')
    // Changing something else leaves it alone.
    const renamed = await send('PATCH', `/api/entries/${entry.id}`, ana, { description: 'Card bill' })
    assert.equal(((await renamed.json()) as SavedEntry).paymentDate, '2026-01-28')
    assert.equal(((await (await change(null)).json()) as SavedEntry).paymentDate, null)
  })

  test('must be a calendar day', async () => {
    for (const paymentDate of ['2026-02-30', '3 Feb', '']) {
      const res = await send('POST', '/api/entries', ana, { ...rent, paymentDate })
      assert.equal(res.status, 400, paymentDate)
      assert.equal(await codeOf(res), 'invalid_input')
    }
  })

  test('is not copied into a new month', async () => {
    await send('POST', '/api/months', ana, { monthKey: '2030-04' })
    await add({ monthKey: '2030-04', description: 'Phone', paymentDate: '2030-04-10' })
    await send('POST', '/api/months', ana, { monthKey: '2030-05', from: '2030-04' })
    assert.deepEqual(await dates('2030-04'), [['Phone', '2030-04-10']])
    assert.deepEqual(await dates('2030-05'), [['Phone', null]])
  })

  test('is never on a template entry', async () => {
    const created = await send('POST', '/api/template/entries', ana, { ...rent, paymentDate: '2026-01-05' })
    const entry = (await created.json()) as SavedEntry
    assert.equal(entry.paymentDate, null)
    const res = await send('PATCH', `/api/entries/${entry.id}`, ana, { paymentDate: '2026-01-05' })
    assert.equal(res.status, 400)
    assert.equal(await codeOf(res), 'template_payment_date')
  })
})

describe('DELETE /api/entries/:id', () => {
  test('removes the entry, its emptied category, and records it', async () => {
    await send('POST', '/api/months', ana, { monthKey: '2026-04' })
    const entry = await add({ monthKey: '2026-04', categoryName: 'Holiday', description: 'Hotel' })
    assert.equal((await send('DELETE', `/api/entries/${entry.id}`, ana)).status, 200)
    assert.deepEqual(layout(await readMonth('2026-04')), [])
    assert.equal(lastActivity().action, 'entry.deleted')
    assert.equal((await send('DELETE', `/api/entries/${entry.id}`, ana)).status, 404)
  })
})

describe('another user', () => {
  test('gets a 404 on the entry and changes nothing', async () => {
    const entry = await add({ description: 'Private' })
    for (const [method, body] of [['PATCH', { amountBani: 1 }], ['DELETE', undefined]] as const) {
      const res = await send(method, `/api/entries/${entry.id}`, ion, body)
      assert.equal(res.status, 404, method)
      assert.equal(await codeOf(res), 'entry_not_found')
    }
    const stored = db.prepare('SELECT amount_bani FROM entries WHERE id = ?').get(entry.id)
    assert.equal(stored?.amount_bani, 150_000)
    assert.ok(!layout(await readMonth('2026-01', ion)).flat(2).includes('Private'))
  })

  test('cannot add to a month they only know the key of', async () => {
    await add({ monthKey: '2026-01', description: 'Ion’s own' }, ion)
    assert.ok(!layout(await readMonth('2026-01')).flat(2).includes('Ion’s own'))
  })
})

test('an ID that is not a UUID is a 400', async () => {
  assert.equal((await send('DELETE', '/api/entries/1', ana)).status, 400)
})

test('needs a session', async () => {
  assert.equal((await send('POST', '/api/entries', null, rent)).status, 401)
})
