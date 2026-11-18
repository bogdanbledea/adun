import { randomUUID } from 'node:crypto'
import { transaction, type Database } from '../../db.ts'
import { badRequest, notFound } from '../../http/errors.ts'
import { LIMITS, limitReached } from '../../lib/limits.ts'
import { logActivity } from '../activity/service.ts'
import * as repo from './repository.ts'
import { budgetNotFound, periodOf } from './service.ts'

/* Purchases paid from a month's food budget.
   - A purchase has a merchant, an amount, a day inside the month's period,
     a source of the same budget and an optional note.
   - It stays in its month: editing moves only the day, within the period.
   - A month holds at most LIMITS.foodPurchasesPerMonth purchases.
   - Each change and its activity entry are one transaction. */

export interface Purchase extends repo.PurchaseRow {
  sourceName: string
}

export interface PurchaseInput {
  merchant: string
  amountBani: number
  spentOn: string
  sourceId: string
  note: string | null
}

const purchaseNotFound = () => notFound('food_purchase_not_found', 'Purchase not found.')
const dateOutside = () => badRequest('food_date_outside_period', 'The date must be inside the budget’s period.')
const unknownSource = () => badRequest('food_unknown_source', 'Unknown source.')

function checkInPeriod(db: Database, userId: string, monthKey: string, spentOn: string): void {
  const period = periodOf(db, userId, monthKey)
  if (spentOn < period.start || spentOn > period.end) throw dateOutside()
}

function sourceNames(db: Database, userId: string, budgetId: string): Map<string, string> {
  return new Map(repo.listSources(db, userId, budgetId).map((s) => [s.id, s.name]))
}

// The same shape as in the month's answer.
function toPurchase(row: repo.PurchaseRow, names: Map<string, string>): Purchase {
  const { id, sourceId, merchant, amountBani, spentOn, note, createdAt } = row
  return { id, sourceId, merchant, amountBani, spentOn, note, createdAt, sourceName: names.get(sourceId) ?? '' }
}

function requirePurchase(db: Database, userId: string, id: string): repo.FullPurchaseRow {
  const purchase = repo.findPurchase(db, userId, id)
  if (!purchase) throw purchaseNotFound()
  return purchase
}

export function addPurchase(db: Database, userId: string, monthKey: string, input: PurchaseInput): Purchase {
  return transaction(db, () => {
    const budget = repo.findBudget(db, userId, monthKey)
    if (!budget) throw budgetNotFound()
    checkInPeriod(db, userId, monthKey, input.spentOn)
    const names = sourceNames(db, userId, budget.id)
    if (!names.has(input.sourceId)) throw unknownSource()
    if (repo.countPurchases(db, userId, budget.id) >= LIMITS.foodPurchasesPerMonth) throw limitReached()

    const id = randomUUID()
    repo.insertPurchase(db, userId, { ...input, id, budgetId: budget.id, now: new Date().toISOString() })
    logActivity(db, userId, 'food.purchase_added', { monthKey, merchant: input.merchant, amountBani: input.amountBani })
    return toPurchase(requirePurchase(db, userId, id), names)
  })
}

/** Changes the fields given; the others keep their values. */
export function updatePurchase(db: Database, userId: string, id: string, changes: Partial<PurchaseInput>): Purchase {
  return transaction(db, () => {
    const current = requirePurchase(db, userId, id)
    if (changes.spentOn !== undefined) checkInPeriod(db, userId, current.monthKey, changes.spentOn)
    const names = sourceNames(db, userId, current.budgetId)
    const next = { ...current, ...changes }
    if (!names.has(next.sourceId)) throw unknownSource()

    repo.updatePurchase(db, userId, id, next)
    logActivity(db, userId, 'food.purchase_updated', {
      monthKey: current.monthKey,
      merchant: next.merchant,
      amountBani: next.amountBani,
    })
    return toPurchase(requirePurchase(db, userId, id), names)
  })
}

export function deletePurchase(db: Database, userId: string, id: string): void {
  transaction(db, () => {
    const current = requirePurchase(db, userId, id)
    repo.deletePurchase(db, userId, id)
    logActivity(db, userId, 'food.purchase_deleted', {
      monthKey: current.monthKey,
      merchant: current.merchant,
      amountBani: current.amountBani,
    })
  })
}

/** Deletes the month's purchases, keeping its sources and period. Returns how many there were. */
export function clearPurchases(db: Database, userId: string, monthKey: string): number {
  return transaction(db, () => {
    const budget = repo.findBudget(db, userId, monthKey)
    if (!budget) throw budgetNotFound()
    const deleted = repo.deletePurchases(db, userId, budget.id)
    logActivity(db, userId, 'food.purchases_cleared', { monthKey, deleted })
    return deleted
  })
}
