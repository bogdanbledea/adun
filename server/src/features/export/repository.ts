import type { Database } from '../../db.ts'
import type { OverrideRow } from '../food/repository.ts'
import type { ReminderRow } from '../reminders/repository.ts'

/* SQL for the export and the import. The export reads every row a user
   keeps, at once per table, for the caller to group. Each query filters by
   the user ID; the food months are the user's own and, while they are in a
   family, the family's. The import writes rows for one user, with the IDs
   and order the caller gives. */

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

// ── Import ───────────────────────────────────────────────────────────────────

/** Whether the user has anything an import could clash with: budget months
    or the template, plans, reminders, food months, calendar corrections, or
    a family. */
export function hasData(db: Database, userId: string): boolean {
  const row = db
    .prepare(
      `SELECT EXISTS (SELECT 1 FROM months WHERE user_id = ?1)
           OR EXISTS (SELECT 1 FROM payment_plans WHERE user_id = ?1)
           OR EXISTS (SELECT 1 FROM reminders WHERE user_id = ?1)
           OR EXISTS (SELECT 1 FROM food_budgets WHERE user_id = ?1)
           OR EXISTS (SELECT 1 FROM work_calendar_overrides WHERE user_id = ?1)
           OR EXISTS (SELECT 1 FROM family_members WHERE user_id = ?1) AS found`,
    )
    .get(userId)
  return row?.found === 1
}

/* One prepared statement per table, made once for the whole import. Every
   row is written for userId. */
export function importer(db: Database, userId: string) {
  const month = db.prepare(
    'INSERT INTO months (id, user_id, month_key, is_template, created_at) VALUES (?, ?, ?, ?, ?)',
  )
  const category = db.prepare('INSERT INTO categories (id, user_id, month_id, name, sort_order) VALUES (?, ?, ?, ?, ?)')
  const entry = db.prepare(
    `INSERT INTO entries (id, user_id, month_id, category_id, description, type, amount_bani, payment_date, plan_id,
                          installment_index, sort_order, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const plan = db.prepare(
    `INSERT INTO payment_plans (id, user_id, name, installments, total_bani, first_month_key, category_name,
                                purchase_date, closed_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const reminder = db.prepare(
    `INSERT INTO reminders (id, user_id, kind, name, subject, due_date, interval_months, lead_days, notes, is_active,
                            created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const budget = db.prepare(
    'INSERT INTO food_budgets (id, user_id, month_key, period_start, plan_from, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  )
  const source = db.prepare(
    'INSERT INTO food_sources (id, budget_id, name, amount_bani, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  )
  const purchase = db.prepare(
    `INSERT INTO food_purchases (id, budget_id, source_id, user_id, merchant, amount_bani, spent_on, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const calendarDay = db.prepare(
    'INSERT INTO work_calendar_overrides (user_id, date, kind, note, created_at) VALUES (?, ?, ?, ?, ?)',
  )

  return {
    month(row: { id: string; monthKey: string | null; createdAt: string }) {
      month.run(row.id, userId, row.monthKey, row.monthKey === null ? 1 : 0, row.createdAt)
    },
    category(row: { id: string; monthId: string; name: string; sortOrder: number }) {
      category.run(row.id, userId, row.monthId, row.name, row.sortOrder)
    },
    entry(row: Omit<EntryRow, 'categoryId'> & { id: string; monthId: string; categoryId: string; sortOrder: number }) {
      entry.run(
        row.id,
        userId,
        row.monthId,
        row.categoryId,
        row.description,
        row.type,
        row.amountBani,
        row.paymentDate,
        row.planId,
        row.installmentIndex,
        row.sortOrder,
        row.createdAt,
      )
    },
    plan(row: PlanRow) {
      plan.run(
        row.id,
        userId,
        row.name,
        row.installmentCount,
        row.totalBani,
        row.firstMonthKey,
        row.categoryName,
        row.purchaseDate,
        row.closedAt,
        row.createdAt,
      )
    },
    reminder(row: ReminderRow) {
      reminder.run(
        row.id,
        userId,
        row.kind,
        row.name,
        row.subject,
        row.dueDate,
        row.intervalMonths,
        JSON.stringify(row.leadDays),
        row.notes,
        row.isActive ? 1 : 0,
        row.createdAt,
      )
    },
    budget(row: Omit<FoodBudgetRow, 'shared'>) {
      budget.run(row.id, userId, row.monthKey, row.periodStart, row.planFrom, row.createdAt)
    },
    source(row: FoodSourceRow & { sortOrder: number }) {
      source.run(row.id, row.budgetId, row.name, row.amountBani, row.sortOrder, row.createdAt)
    },
    purchase(row: FoodPurchaseRow & { id: string; budgetId: string }) {
      purchase.run(row.id, row.budgetId, row.sourceId, userId, row.merchant, row.amountBani, row.spentOn, row.note, row.createdAt)
    },
    calendarDay(row: OverrideRow & { createdAt: string }) {
      calendarDay.run(userId, row.date, row.kind, row.note, row.createdAt)
    },
  }
}
