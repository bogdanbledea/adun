import type { Database } from '../../db.ts'

/* SQL for the export: every row a user keeps, read at once per table and
   grouped by the caller. Each query filters by the user ID; the food months
   are the user's own and, while they are in a family, the family's. */

export interface MonthRow {
  id: string
  /** Null on the template. */
  monthKey: string | null
  createdAt: string
}

export interface CategoryRow {
  id: string
  monthId: string
  name: string
}

export interface EntryRow {
  categoryId: string
  description: string
  type: 'income' | 'expense'
  amountBani: number
  paymentDate: string | null
  planId: string | null
  installmentIndex: number | null
  createdAt: string
}

export interface PlanRow {
  id: string
  name: string
  installmentCount: number
  totalBani: number
  firstMonthKey: string
  categoryName: string
  purchaseDate: string | null
  closedAt: string | null
  createdAt: string
}

export interface FoodBudgetRow {
  id: string
  monthKey: string
  shared: boolean
  periodStart: string
  planFrom: string
  createdAt: string
}

export interface FoodSourceRow {
  id: string
  budgetId: string
  name: string
  amountBani: number
  createdAt: string
}

export interface FoodPurchaseRow {
  sourceId: string
  merchant: string
  amountBani: number
  spentOn: string
  note: string | null
  createdAt: string
}

export function exportMonths(db: Database, userId: string): MonthRow[] {
  return db
    .prepare('SELECT id, month_key, created_at FROM months WHERE user_id = ? ORDER BY month_key')
    .all(userId)
    .map((row) => ({ id: row.id as string, monthKey: row.month_key as string | null, createdAt: row.created_at as string }))
}

export function exportCategories(db: Database, userId: string): CategoryRow[] {
  return db
    .prepare('SELECT id, month_id, name FROM categories WHERE user_id = ? ORDER BY sort_order, rowid')
    .all(userId)
    .map((row) => ({ id: row.id as string, monthId: row.month_id as string, name: row.name as string }))
}

export function exportEntries(db: Database, userId: string): EntryRow[] {
  return db
    .prepare(
      `SELECT category_id, description, type, amount_bani, payment_date, plan_id, installment_index, created_at
       FROM entries WHERE user_id = ? ORDER BY sort_order, rowid`,
    )
    .all(userId)
    .map((row) => ({
      categoryId: row.category_id as string,
      description: row.description as string,
      type: row.type as 'income' | 'expense',
      amountBani: row.amount_bani as number,
      paymentDate: row.payment_date as string | null,
      planId: row.plan_id as string | null,
      installmentIndex: row.installment_index as number | null,
      createdAt: row.created_at as string,
    }))
}

export function exportPlans(db: Database, userId: string): PlanRow[] {
  return db
    .prepare(
      `SELECT id, name, installments, total_bani, first_month_key, category_name, purchase_date, closed_at, created_at
       FROM payment_plans WHERE user_id = ? ORDER BY created_at, rowid`,
    )
    .all(userId)
    .map((row) => ({
      id: row.id as string,
      name: row.name as string,
      installmentCount: row.installments as number,
      totalBani: row.total_bani as number,
      firstMonthKey: row.first_month_key as string,
      categoryName: row.category_name as string,
      purchaseDate: row.purchase_date as string | null,
      closedAt: row.closed_at as string | null,
      createdAt: row.created_at as string,
    }))
}

/* The user's personal food budgets, and their family's when familyId is set.
   `family_id = ?` matches nothing for a null familyId. Binds userId, familyId. */
const FOOD_BUDGETS = '(family_id IS NULL AND user_id = ?) OR family_id = ?'

export function exportFoodBudgets(db: Database, userId: string, familyId: string | null): FoodBudgetRow[] {
  return db
    .prepare(
      `SELECT id, month_key, family_id IS NOT NULL AS shared, period_start, plan_from, created_at
       FROM food_budgets WHERE ${FOOD_BUDGETS} ORDER BY month_key, shared`,
    )
    .all(userId, familyId)
    .map((row) => ({
      id: row.id as string,
      monthKey: row.month_key as string,
      shared: row.shared === 1,
      periodStart: row.period_start as string,
      planFrom: row.plan_from as string,
      createdAt: row.created_at as string,
    }))
}

export function exportFoodSources(db: Database, userId: string, familyId: string | null): FoodSourceRow[] {
  return db
    .prepare(
      `SELECT id, budget_id, name, amount_bani, created_at FROM food_sources
       WHERE budget_id IN (SELECT id FROM food_budgets WHERE ${FOOD_BUDGETS}) ORDER BY sort_order, rowid`,
    )
    .all(userId, familyId)
    .map((row) => ({
      id: row.id as string,
      budgetId: row.budget_id as string,
      name: row.name as string,
      amountBani: row.amount_bani as number,
      createdAt: row.created_at as string,
    }))
}

export function exportFoodPurchases(db: Database, userId: string, familyId: string | null): FoodPurchaseRow[] {
  return db
    .prepare(
      `SELECT source_id, merchant, amount_bani, spent_on, note, created_at FROM food_purchases
       WHERE budget_id IN (SELECT id FROM food_budgets WHERE ${FOOD_BUDGETS}) ORDER BY spent_on, created_at, rowid`,
    )
    .all(userId, familyId)
    .map((row) => ({
      sourceId: row.source_id as string,
      merchant: row.merchant as string,
      amountBani: row.amount_bani as number,
      spentOn: row.spent_on as string,
      note: row.note as string | null,
      createdAt: row.created_at as string,
    }))
}
