import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { describe, test } from 'node:test'
import { createUser } from '../../../test/auth.ts'
import { tempDatabase } from '../../../test/helpers.ts'
import * as repo from './repository.ts'

/* Food budgets keep their own data in shape: a purchase's source is in its
   budget, a source cannot go while it has purchases, and one user's IDs never
   reach another user's rows. */

const { db } = tempDatabase()
await createUser(db, 'ana@example.com')
await createUser(db, 'ion@example.com', 'Ion Ionescu')

const idOf = (email: string) => (db.prepare('SELECT id FROM users WHERE email = ?').get(email) as { id: string }).id
const anaId = idOf('ana@example.com')
const ionId = idOf('ion@example.com')
const now = new Date().toISOString()

function addBudget(userId: string, monthKey: string): string {
  const id = randomUUID()
  repo.insertBudget(db, { id, userId, monthKey, periodStart: `${monthKey}-01`, planFrom: `${monthKey}-01`, now })
  return id
}

function addSource(userId: string, budgetId: string, fields: { name?: string; amountBani?: number } = {}): string {
  const id = randomUUID()
  repo.insertSource(db, userId, { name: 'Card', amountBani: 150000, sortOrder: 0, ...fields, id, budgetId, now })
  return id
}

function addPurchase(userId: string, budgetId: string, sourceId: string, fields: Partial<repo.PurchaseFields> = {}): string {
  const id = randomUUID()
  repo.insertPurchase(db, userId, {
    sourceId,
    merchant: 'Lidl',
    amountBani: 8450,
    spentOn: '2026-11-03',
    note: null,
    ...fields,
    id,
    budgetId,
    now,
  })
  return id
}

const count = (table: string) => db.prepare(`SELECT count(*) AS n FROM ${table}`).get()?.n as number

const anaBudget = addBudget(anaId, '2026-11')
const anaCard = addSource(anaId, anaBudget)
const ionBudget = addBudget(ionId, '2026-11')
const ionCard = addSource(ionId, ionBudget)

describe('food budgets', () => {
  test('are one per user and month', () => {
    assert.throws(() => addBudget(anaId, '2026-11'), /UNIQUE constraint failed/)
    assert.doesNotThrow(() => addBudget(anaId, '2026-12'))
  })

  test('are for a month from 2024 to 2099', () => {
    assert.doesNotThrow(() => addBudget(anaId, '2024-01'))
    assert.doesNotThrow(() => addBudget(anaId, '2099-12'))
    for (const monthKey of ['2023-12', '2100-01', '2026-13', 'November']) {
      assert.throws(() => addBudget(anaId, monthKey), /CHECK constraint failed/, monthKey)
    }
  })

  test('are found only by their user', () => {
    assert.equal(repo.findBudget(db, anaId, '2026-11')?.id, anaBudget)
    assert.equal(repo.findBudget(db, ionId, '2026-11')?.id, ionBudget)
    assert.equal(repo.previousBudget(db, ionId, '2026-12')?.id, ionBudget)
    repo.deleteBudget(db, ionId, anaBudget)
    assert.ok(repo.findBudget(db, anaId, '2026-11'))
  })
})

describe('sources', () => {
  test('have a name and an amount up to 1,000,000 lei', () => {
    assert.doesNotThrow(() => addSource(anaId, anaBudget, { amountBani: 0 }))
    assert.doesNotThrow(() => addSource(anaId, anaBudget, { amountBani: 100000000 }))
    assert.throws(() => addSource(anaId, anaBudget, { amountBani: 100000001 }), /CHECK constraint failed/)
    assert.throws(() => addSource(anaId, anaBudget, { name: '' }), /CHECK constraint failed/)
  })

  test('are listed, added, changed and removed only in the user’s own budgets', () => {
    const before = count('food_sources')
    addSource(ionId, anaBudget)
    assert.equal(count('food_sources'), before)

    assert.deepEqual(repo.listSources(db, ionId, anaBudget), [])
    repo.updateSource(db, ionId, { id: anaCard, budgetId: anaBudget, name: 'Mine', amountBani: 1, sortOrder: 0 })
    repo.deleteSource(db, ionId, anaBudget, anaCard)
    assert.deepEqual(repo.listSources(db, anaId, anaBudget)[0], { id: anaCard, name: 'Card', amountBani: 150000 })
  })

  test('cannot be removed while they have purchases', () => {
    const source = addSource(anaId, anaBudget, { name: 'Cash' })
    addPurchase(anaId, anaBudget, source)
    assert.equal(repo.sourceInUse(db, anaId, [anaCard, source]), source)
    assert.equal(repo.sourceInUse(db, ionId, [anaCard, source]), null)
    assert.throws(() => { repo.deleteSource(db, anaId, anaBudget, source) }, /FOREIGN KEY constraint failed/)
  })
})

describe('purchases', () => {
  test('have a merchant, a day and an amount of 0.01 to 100,000 lei', () => {
    assert.doesNotThrow(() => addPurchase(anaId, anaBudget, anaCard, { amountBani: 1 }))
    assert.doesNotThrow(() => addPurchase(anaId, anaBudget, anaCard, { amountBani: 10000000 }))
    for (const amountBani of [0, 10000001]) {
      assert.throws(() => addPurchase(anaId, anaBudget, anaCard, { amountBani }), /CHECK constraint failed/, String(amountBani))
    }
    assert.throws(() => addPurchase(anaId, anaBudget, anaCard, { merchant: '' }), /CHECK constraint failed/)
    assert.throws(() => addPurchase(anaId, anaBudget, anaCard, { spentOn: '3 Nov' }), /CHECK constraint failed/)
    assert.throws(() => addPurchase(anaId, anaBudget, anaCard, { note: '' }), /CHECK constraint failed/)
  })

  test('are paid from a source of their own budget', () => {
    assert.throws(() => addPurchase(anaId, anaBudget, ionCard), /FOREIGN KEY constraint failed/)
  })

  test('record who added them', () => {
    const id = addPurchase(anaId, anaBudget, anaCard)
    assert.equal(db.prepare('SELECT user_id FROM food_purchases WHERE id = ?').get(id)?.user_id, anaId)
  })

  test('are found, changed and deleted only by the budget’s user', () => {
    const id = addPurchase(anaId, anaBudget, anaCard, { merchant: 'Mega' })
    const before = count('food_purchases')
    addPurchase(ionId, anaBudget, anaCard)
    assert.equal(count('food_purchases'), before)

    assert.equal(repo.findPurchase(db, ionId, id), null)
    assert.deepEqual(repo.listPurchases(db, ionId, anaBudget), [])
    assert.equal(repo.countPurchases(db, ionId, anaBudget), 0)
    repo.updatePurchase(db, ionId, id, { sourceId: anaCard, merchant: 'Ion', amountBani: 1, spentOn: '2026-11-01', note: null })
    repo.deletePurchase(db, ionId, id)
    assert.equal(repo.deletePurchases(db, ionId, anaBudget), 0)

    const purchase = repo.findPurchase(db, anaId, id)
    assert.equal(purchase?.merchant, 'Mega')
    assert.equal(purchase.monthKey, '2026-11')
  })

  test('are listed newest day first', () => {
    const budget = addBudget(anaId, '2027-01')
    const source = addSource(anaId, budget)
    addPurchase(anaId, budget, source, { merchant: 'First', spentOn: '2027-01-02' })
    addPurchase(anaId, budget, source, { merchant: 'Later', spentOn: '2027-01-09' })
    addPurchase(anaId, budget, source, { merchant: 'Same day', spentOn: '2027-01-02' })
    assert.deepEqual(
      repo.listPurchases(db, anaId, budget).map((p) => p.merchant),
      ['Later', 'Same day', 'First'],
    )
  })
})

test('deleting a budget takes its sources and purchases', () => {
  const budget = addBudget(anaId, '2027-02')
  addPurchase(anaId, budget, addSource(anaId, budget))
  repo.deleteBudget(db, anaId, budget)
  for (const table of ['food_sources', 'food_purchases']) {
    assert.equal(db.prepare(`SELECT count(*) AS n FROM ${table} WHERE budget_id = ?`).get(budget)?.n, 0, table)
  }
})

test('deleting a user removes their food budgets', async () => {
  await createUser(db, 'maria@example.com', 'Maria Pop')
  const mariaId = idOf('maria@example.com')
  const budget = addBudget(mariaId, '2026-11')
  addPurchase(mariaId, budget, addSource(mariaId, budget))

  db.prepare('DELETE FROM users WHERE id = ?').run(mariaId)
  assert.equal(db.prepare('SELECT count(*) AS n FROM food_budgets WHERE user_id = ?').get(mariaId)?.n, 0)
  for (const table of ['food_sources', 'food_purchases']) {
    assert.equal(db.prepare(`SELECT count(*) AS n FROM ${table} WHERE budget_id = ?`).get(budget)?.n, 0, table)
  }
})
