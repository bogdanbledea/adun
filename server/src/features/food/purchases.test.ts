import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { appClient, createUser, signIn } from '../../../test/auth.ts'
import { tempDatabase } from '../../../test/helpers.ts'
import { LIMITS } from '../../lib/limits.ts'

const { db, dataDir } = tempDatabase()
await createUser(db, 'ana@example.com')
await createUser(db, 'ion@example.com', 'Ion Ionescu')

const client = await appClient(db, dataDir)
const ana = await signIn(client, 'ana@example.com')
const ion = await signIn(client, 'ion@example.com')
const anaId = (db.prepare("SELECT id FROM users WHERE email = 'ana@example.com'").get() as { id: string }).id

interface Purchase {
  id: string
  merchant: string
  amountBani: number
  spentOn: string
  sourceId: string
  sourceName: string
  note: string | null
}

interface Month {
  totalBani: number
  spentBani: number
  remainingBani: number
  sources: { id: string; name: string; amountBani: number; spentBani: number; remainingBani: number }[]
  merchants: { name: string; totalBani: number; count: number }[]
  purchases: Purchase[]
}

const send = (method: string, path: string, cookie: string, body?: unknown) =>
  client.request(method, path, { body, headers: { cookie } })
const codeOf = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code
const read = async (monthKey: string, cookie = ana) => (await (await send('GET', `/api/food/${monthKey}`, cookie)).json()) as Month
const lastActivity = () =>
  db.prepare('SELECT action, metadata FROM activity_logs WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(anaId)

/** A budget with a card of 1,500 lei and 200 lei cash; returns their IDs. */
async function budget(monthKey: string, cookie = ana): Promise<{ card: string; cash: string }> {
  const res = await send('PUT', `/api/food/${monthKey}/sources?today=${monthKey}-01`, cookie, {
    sources: [
      { name: 'Card', amountBani: 150000 },
      { name: 'Cash', amountBani: 20000 },
    ],
  })
  const [card, cash] = ((await res.json()) as Month).sources
  return { card: card?.id ?? '', cash: cash?.id ?? '' }
}

const add = (monthKey: string, body: Record<string, unknown>, cookie = ana) =>
  send('POST', `/api/food/${monthKey}/purchases`, cookie, { merchant: 'Lidl', amountBani: 8450, spentOn: `${monthKey}-03`, ...body })
const added = async (monthKey: string, body: Record<string, unknown>) => {
  const res = await add(monthKey, body)
  assert.equal(res.status, 201)
  return (await res.json()) as Purchase
}

describe('adding a purchase', () => {
  test('tidies the merchant, names the source and records it', async () => {
    const { card } = await budget('2026-11')
    const purchase = await added('2026-11', { merchant: '  Mega   Image ', sourceId: card, note: '  ' })
    assert.deepEqual(
      { ...purchase, id: undefined, createdAt: undefined },
      {
        id: undefined,
        createdAt: undefined,
        merchant: 'Mega Image',
        amountBani: 8450,
        spentOn: '2026-11-03',
        sourceId: card,
        sourceName: 'Card',
        note: null,
      },
    )
    assert.deepEqual({ ...lastActivity() }, {
      action: 'food.purchase_added',
      metadata: JSON.stringify({ monthKey: '2026-11', merchant: 'Mega Image', amountBani: 8450 }),
    })
  })

  test('adds up the month by source and by merchant', async () => {
    const { card, cash } = await budget('2026-10')
    await added('2026-10', { merchant: 'kaufland', amountBani: 10000, sourceId: card, spentOn: '2026-10-02' })
    await added('2026-10', { merchant: 'Kaufland', amountBani: 5000, sourceId: cash, spentOn: '2026-10-05' })
    await added('2026-10', { merchant: 'Piață', amountBani: 12000, sourceId: cash, spentOn: '2026-10-04' })

    const month = await read('2026-10')
    assert.deepEqual([month.totalBani, month.spentBani, month.remainingBani], [170000, 27000, 143000])
    assert.deepEqual(month.sources.map((s) => [s.name, s.spentBani, s.remainingBani]), [
      ['Card', 10000, 140000],
      ['Cash', 17000, 3000],
    ])
    assert.deepEqual(month.merchants, [
      { name: 'Kaufland', totalBani: 15000, count: 2 },
      { name: 'Piață', totalBani: 12000, count: 1 },
    ])
    assert.deepEqual(month.purchases.map((p) => [p.spentOn, p.sourceName]), [
      ['2026-10-05', 'Cash'],
      ['2026-10-04', 'Cash'],
      ['2026-10-02', 'Card'],
    ])
  })

  test('needs a day inside the period and a source of the same budget', async () => {
    const { card } = await budget('2026-09')
    const other = await budget('2026-08')
    for (const spentOn of ['2026-08-31', '2026-10-01']) {
      const res = await add('2026-09', { sourceId: card, spentOn })
      assert.equal(res.status, 400, spentOn)
      assert.equal(await codeOf(res), 'food_date_outside_period')
    }
    const res = await add('2026-09', { sourceId: other.card })
    assert.equal(res.status, 400)
    assert.equal(await codeOf(res), 'food_unknown_source')
  })

  test('needs a budget', async () => {
    const { card } = await budget('2026-07')
    const res = await add('2026-06', { sourceId: card })
    assert.equal(res.status, 404)
    assert.equal(await codeOf(res), 'food_budget_not_found')
  })

  test('refuses what is out of bounds', async () => {
    const { card } = await budget('2026-05')
    const bad = [
      { merchant: '   ' },
      { merchant: 'x'.repeat(65) },
      { amountBani: 0 },
      { amountBani: 10_000_001 },
      { amountBani: 12.5 },
      { note: 'x'.repeat(257) },
      { spentOn: '3 May' },
    ]
    for (const body of bad) {
      assert.equal((await add('2026-05', { sourceId: card, ...body })).status, 400, JSON.stringify(body))
    }
  })

  test('stops at the month’s limit', async () => {
    const { card } = await budget('2026-04')
    const budgetId = db.prepare("SELECT id FROM food_budgets WHERE user_id = ? AND month_key = '2026-04'").get(anaId)?.id
    const insert = db.prepare(
      `INSERT INTO food_purchases (id, budget_id, source_id, user_id, merchant, amount_bani, spent_on, created_at)
       VALUES (?, ?, ?, ?, 'Lidl', 100, '2026-04-02', '2026-04-02T10:00:00Z')`,
    )
    for (let i = 0; i < LIMITS.foodPurchasesPerMonth; i++) insert.run(`p${String(i)}`, budgetId as string, card, anaId)
    const res = await add('2026-04', { sourceId: card })
    assert.equal(res.status, 409)
    assert.equal(await codeOf(res), 'limit_reached')
  })
})

describe('editing a purchase', () => {
  test('changes only the fields given and records it', async () => {
    const { card, cash } = await budget('2027-01')
    const purchase = await added('2027-01', { sourceId: card, note: 'Weekly shop' })
    const res = await send('PATCH', `/api/food/purchases/${purchase.id}`, ana, { amountBani: 9000, sourceId: cash })
    assert.equal(res.status, 200)
    const changed = (await res.json()) as Purchase
    assert.deepEqual(
      [changed.merchant, changed.amountBani, changed.sourceName, changed.note],
      ['Lidl', 9000, 'Cash', 'Weekly shop'],
    )
    assert.deepEqual({ ...lastActivity() }, {
      action: 'food.purchase_updated',
      metadata: JSON.stringify({ monthKey: '2027-01', merchant: 'Lidl', amountBani: 9000 }),
    })

    const cleared = await send('PATCH', `/api/food/purchases/${purchase.id}`, ana, { note: null })
    assert.equal(((await cleared.json()) as Purchase).note, null)
  })

  test('moves the day only within the period', async () => {
    const { card } = await budget('2027-02')
    const purchase = await added('2027-02', { sourceId: card })
    const moved = await send('PATCH', `/api/food/purchases/${purchase.id}`, ana, { spentOn: '2027-02-28' })
    assert.equal(((await moved.json()) as Purchase).spentOn, '2027-02-28')
    const res = await send('PATCH', `/api/food/purchases/${purchase.id}`, ana, { spentOn: '2027-03-01' })
    assert.equal(res.status, 400)
    assert.equal(await codeOf(res), 'food_date_outside_period')
  })

  test('needs a change and a known purchase', async () => {
    const { card } = await budget('2027-03')
    const purchase = await added('2027-03', { sourceId: card })
    assert.equal((await send('PATCH', `/api/food/purchases/${purchase.id}`, ana, {})).status, 400)
    const res = await send('PATCH', `/api/food/purchases/${crypto.randomUUID()}`, ana, { amountBani: 1 })
    assert.equal(res.status, 404)
    assert.equal(await codeOf(res), 'food_purchase_not_found')
  })
})

describe('deleting', () => {
  test('a purchase removes it and records it', async () => {
    const { card } = await budget('2027-04')
    const purchase = await added('2027-04', { sourceId: card })
    assert.equal((await send('DELETE', `/api/food/purchases/${purchase.id}`, ana)).status, 200)
    assert.deepEqual((await read('2027-04')).purchases, [])
    assert.deepEqual({ ...lastActivity() }, {
      action: 'food.purchase_deleted',
      metadata: JSON.stringify({ monthKey: '2027-04', merchant: 'Lidl', amountBani: 8450 }),
    })
  })

  test('the month’s purchases keeps its sources', async () => {
    const { card, cash } = await budget('2027-05')
    await added('2027-05', { sourceId: card })
    await added('2027-05', { sourceId: cash })
    const res = await send('DELETE', '/api/food/2027-05/purchases', ana)
    assert.deepEqual(await res.json(), { ok: true, deleted: 2 })
    const month = await read('2027-05')
    assert.deepEqual([month.purchases.length, month.sources.length, month.spentBani], [0, 2, 0])
    assert.deepEqual({ ...lastActivity() }, {
      action: 'food.purchases_cleared',
      metadata: JSON.stringify({ monthKey: '2027-05', deleted: 2 }),
    })
  })
})

test('another user cannot add to, read, change or delete the purchases', async () => {
  const { card } = await budget('2028-06')
  const purchase = await added('2028-06', { sourceId: card })
  await budget('2028-06', ion)

  assert.equal(await codeOf(await add('2028-06', { sourceId: card }, ion)), 'food_unknown_source')
  assert.deepEqual((await read('2028-06', ion)).purchases, [])
  for (const [method, body] of [['PATCH', { amountBani: 1 }], ['DELETE', undefined]] as const) {
    const res = await send(method, `/api/food/purchases/${purchase.id}`, ion, body)
    assert.equal(res.status, 404, method)
  }
  await send('DELETE', '/api/food/2028-06/purchases', ion)
  assert.deepEqual((await read('2028-06')).purchases.map((p) => [p.id, p.amountBani]), [[purchase.id, 8450]])
})
