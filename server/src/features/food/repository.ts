import type { Database } from '../../db.ts'
import type { CalendarOverrides } from './workdays.ts'

/* SQL for food budgets, their sources and purchases, and the user's
   corrections to the working calendar. Every function takes the user ID and
   filters by it: budgets and corrections by their user_id, sources and
   purchases by belonging to one of the user's budgets. */

export interface BudgetRow {
  id: string
  monthKey: string
  periodStart: string
  planFrom: string
}

export interface SourceRow {
  id: string
  name: string
  amountBani: number
}

export interface PurchaseFields {
  sourceId: string
  merchant: string
  amountBani: number
  spentOn: string
  note: string | null
}

export interface PurchaseRow extends PurchaseFields {
  id: string
  createdAt: string
}

/** A purchase with its budget and the budget's month. */
export interface FullPurchaseRow extends PurchaseRow {
  budgetId: string
  monthKey: string
}

// Matches a source or purchase row whose budget belongs to the user; binds the user ID.
const OWN_BUDGET = 'budget_id IN (SELECT id FROM food_budgets WHERE user_id = ?)'

const BUDGET_COLUMNS = 'id, month_key, period_start, plan_from'
const PURCHASE_COLUMNS = 'p.id, p.source_id, p.merchant, p.amount_bani, p.spent_on, p.note, p.created_at'

const toBudgetRow = (row: Record<string, unknown>): BudgetRow => ({
  id: row.id as string,
  monthKey: row.month_key as string,
  periodStart: row.period_start as string,
  planFrom: row.plan_from as string,
})

const toPurchaseRow = (row: Record<string, unknown>): PurchaseRow => ({
  id: row.id as string,
  sourceId: row.source_id as string,
  merchant: row.merchant as string,
  amountBani: row.amount_bani as number,
  spentOn: row.spent_on as string,
  note: row.note as string | null,
  createdAt: row.created_at as string,
})

// ── Budgets ──────────────────────────────────────────────────────────────────

export function findBudget(db: Database, userId: string, monthKey: string): BudgetRow | null {
  const row = db
    .prepare(`SELECT ${BUDGET_COLUMNS} FROM food_budgets WHERE user_id = ? AND month_key = ?`)
    .get(userId, monthKey)
  return row ? toBudgetRow(row) : null
}

/** The latest budget before `monthKey`, whose sources a new month starts from. */
export function previousBudget(db: Database, userId: string, monthKey: string): BudgetRow | null {
  const row = db
    .prepare(
      `SELECT ${BUDGET_COLUMNS} FROM food_budgets WHERE user_id = ? AND month_key < ? ORDER BY month_key DESC LIMIT 1`,
    )
    .get(userId, monthKey)
  return row ? toBudgetRow(row) : null
}

export function insertBudget(
  db: Database,
  budget: { id: string; userId: string; monthKey: string; periodStart: string; planFrom: string; now: string },
): void {
  db.prepare(
    'INSERT INTO food_budgets (id, user_id, month_key, period_start, plan_from, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(budget.id, budget.userId, budget.monthKey, budget.periodStart, budget.planFrom, budget.now)
}

/** Stored starts of the given months; months without a budget are missing. */
export function storedStarts(db: Database, userId: string, monthKeys: string[]): Map<string, string> {
  const rows = db
    .prepare(
      `SELECT month_key, period_start FROM food_budgets
       WHERE user_id = ? AND month_key IN (SELECT value FROM json_each(?))`,
    )
    .all(userId, JSON.stringify(monthKeys))
  return new Map(rows.map((row) => [row.month_key as string, row.period_start as string]))
}

export function setPeriodStart(db: Database, userId: string, budgetId: string, periodStart: string): void {
  db.prepare('UPDATE food_budgets SET period_start = ? WHERE id = ? AND user_id = ?').run(periodStart, budgetId, userId)
}

/** Its sources and purchases go with it (ON DELETE CASCADE). */
export function deleteBudget(db: Database, userId: string, budgetId: string): void {
  db.prepare('DELETE FROM food_budgets WHERE id = ? AND user_id = ?').run(budgetId, userId)
}

// ── Sources ──────────────────────────────────────────────────────────────────

export function listSources(db: Database, userId: string, budgetId: string): SourceRow[] {
  return db
    .prepare(`SELECT id, name, amount_bani FROM food_sources WHERE budget_id = ? AND ${OWN_BUDGET} ORDER BY sort_order, rowid`)
    .all(budgetId, userId)
    .map((row) => ({ id: row.id as string, name: row.name as string, amountBani: row.amount_bani as number }))
}

type SourceFields = { name: string; amountBani: number; sortOrder: number }

/** Adds nothing unless the budget is the user's. */
export function insertSource(
  db: Database,
  userId: string,
  source: SourceFields & { id: string; budgetId: string; now: string },
): void {
  db.prepare(
    `INSERT INTO food_sources (id, budget_id, name, amount_bani, sort_order, created_at)
     SELECT ?, id, ?, ?, ?, ? FROM food_budgets WHERE id = ? AND user_id = ?`,
  ).run(source.id, source.name, source.amountBani, source.sortOrder, source.now, source.budgetId, userId)
}

export function updateSource(db: Database, userId: string, source: SourceFields & { id: string; budgetId: string }): void {
  db.prepare(
    `UPDATE food_sources SET name = ?, amount_bani = ?, sort_order = ? WHERE id = ? AND budget_id = ? AND ${OWN_BUDGET}`,
  ).run(source.name, source.amountBani, source.sortOrder, source.id, source.budgetId, userId)
}

export function deleteSource(db: Database, userId: string, budgetId: string, sourceId: string): void {
  db.prepare(`DELETE FROM food_sources WHERE id = ? AND budget_id = ? AND ${OWN_BUDGET}`).run(sourceId, budgetId, userId)
}

/** Of the given sources, one that has purchases, if any. */
export function sourceInUse(db: Database, userId: string, sourceIds: string[]): string | null {
  const row = db
    .prepare(`SELECT source_id FROM food_purchases WHERE source_id IN (SELECT value FROM json_each(?)) AND ${OWN_BUDGET} LIMIT 1`)
    .get(JSON.stringify(sourceIds), userId)
  return row ? (row.source_id as string) : null
}

// ── Purchases ────────────────────────────────────────────────────────────────

/** Newest day first and, within a day, the last added first. */
export function listPurchases(db: Database, userId: string, budgetId: string): PurchaseRow[] {
  return db
    .prepare(
      `SELECT ${PURCHASE_COLUMNS} FROM food_purchases p
       WHERE p.budget_id = ? AND ${OWN_BUDGET}
       ORDER BY p.spent_on DESC, p.created_at DESC, p.rowid DESC`,
    )
    .all(budgetId, userId)
    .map(toPurchaseRow)
}

export function findPurchase(db: Database, userId: string, id: string): FullPurchaseRow | null {
  const row = db
    .prepare(
      `SELECT ${PURCHASE_COLUMNS}, b.id AS budget_id, b.month_key FROM food_purchases p
       JOIN food_budgets b ON b.id = p.budget_id
       WHERE p.id = ? AND b.user_id = ?`,
    )
    .get(id, userId)
  return row ? { ...toPurchaseRow(row), budgetId: row.budget_id as string, monthKey: row.month_key as string } : null
}

export function countPurchases(db: Database, userId: string, budgetId: string): number {
  return db.prepare(`SELECT count(*) AS n FROM food_purchases WHERE budget_id = ? AND ${OWN_BUDGET}`).get(budgetId, userId)
    ?.n as number
}

/** Adds nothing unless the budget is the user's; the user is recorded as who added it. */
export function insertPurchase(
  db: Database,
  userId: string,
  purchase: PurchaseFields & { id: string; budgetId: string; now: string },
): void {
  db.prepare(
    `INSERT INTO food_purchases (id, budget_id, source_id, user_id, merchant, amount_bani, spent_on, note, created_at)
     SELECT ?, id, ?, user_id, ?, ?, ?, ?, ? FROM food_budgets WHERE id = ? AND user_id = ?`,
  ).run(
    purchase.id,
    purchase.sourceId,
    purchase.merchant,
    purchase.amountBani,
    purchase.spentOn,
    purchase.note,
    purchase.now,
    purchase.budgetId,
    userId,
  )
}

/** Writes every field; the caller merges the changes into the current row. */
export function updatePurchase(db: Database, userId: string, id: string, fields: PurchaseFields): void {
  db.prepare(
    `UPDATE food_purchases SET source_id = ?, merchant = ?, amount_bani = ?, spent_on = ?, note = ?
     WHERE id = ? AND ${OWN_BUDGET}`,
  ).run(fields.sourceId, fields.merchant, fields.amountBani, fields.spentOn, fields.note, id, userId)
}

export function deletePurchase(db: Database, userId: string, id: string): void {
  db.prepare(`DELETE FROM food_purchases WHERE id = ? AND ${OWN_BUDGET}`).run(id, userId)
}

/** Whether moving `monthKey`'s start to `start` would leave a purchase
    outside its period: one of this month's before it, or one of the previous
    month's on or after it. */
export function hasPurchasesOutside(
  db: Database,
  userId: string,
  months: { monthKey: string; previousMonthKey: string },
  start: string,
): boolean {
  const row = db
    .prepare(
      `SELECT 1 FROM food_purchases p JOIN food_budgets b ON b.id = p.budget_id
       WHERE b.user_id = ?
         AND ((b.month_key = ? AND p.spent_on < ?) OR (b.month_key = ? AND p.spent_on >= ?))
       LIMIT 1`,
    )
    .get(userId, months.monthKey, start, months.previousMonthKey, start)
  return row !== undefined
}

/** Deletes every purchase of the budget and returns how many there were. */
export function deletePurchases(db: Database, userId: string, budgetId: string): number {
  return Number(db.prepare(`DELETE FROM food_purchases WHERE budget_id = ? AND ${OWN_BUDGET}`).run(budgetId, userId).changes)
}

// ── Working calendar ─────────────────────────────────────────────────────────

export interface OverrideRow {
  date: string
  kind: 'off' | 'working'
  note: string | null
}

export function listOverrides(db: Database, userId: string): OverrideRow[] {
  return db
    .prepare('SELECT date, kind, note FROM work_calendar_overrides WHERE user_id = ? ORDER BY date')
    .all(userId)
    .map((row) => ({ date: row.date as string, kind: row.kind as 'off' | 'working', note: row.note as string | null }))
}

export const overrideMap = (rows: OverrideRow[]): CalendarOverrides => new Map(rows.map((row) => [row.date, row.kind]))

export function countOverrides(db: Database, userId: string): number {
  return db.prepare('SELECT count(*) AS n FROM work_calendar_overrides WHERE user_id = ?').get(userId)?.n as number
}

/** Sets the day, replacing a correction it had. */
export function upsertOverride(db: Database, userId: string, override: OverrideRow & { now: string }): void {
  db.prepare(
    `INSERT INTO work_calendar_overrides (user_id, date, kind, note, created_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (user_id, date) DO UPDATE SET kind = excluded.kind, note = excluded.note`,
  ).run(userId, override.date, override.kind, override.note, override.now)
}

/** Returns whether there was one to delete. */
export function deleteOverride(db: Database, userId: string, date: string): boolean {
  return db.prepare('DELETE FROM work_calendar_overrides WHERE user_id = ? AND date = ?').run(userId, date).changes === 1
}
