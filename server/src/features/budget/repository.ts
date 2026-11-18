import type { Database } from '../../db.ts'

/* SQL for months, categories and entries. Every function takes the user ID
   and filters by it, so one user's IDs never reach another's rows. */

export type EntryType = 'income' | 'expense'

export interface MonthRow {
  id: string
  monthKey: string
}

export interface CategoryRow {
  id: string
  name: string
}

export interface EntryRow {
  id: string
  categoryId: string
  description: string
  type: EntryType
  amountBani: number
}

export interface Totals {
  incomeBani: number
  expenseBani: number
}

// ── Months ───────────────────────────────────────────────────────────────────

/** Oldest first. */
export function listMonthKeys(db: Database, userId: string): string[] {
  return db
    .prepare('SELECT month_key FROM months WHERE user_id = ? ORDER BY month_key')
    .all(userId)
    .map((row) => row.month_key as string)
}

export function findMonth(db: Database, userId: string, monthKey: string): MonthRow | null {
  const row = db.prepare('SELECT id, month_key FROM months WHERE user_id = ? AND month_key = ?').get(userId, monthKey)
  return row ? { id: row.id as string, monthKey: row.month_key as string } : null
}

export function insertMonth(db: Database, month: { id: string; userId: string; monthKey: string; now: string }): void {
  db.prepare('INSERT INTO months (id, user_id, month_key, created_at) VALUES (?, ?, ?, ?)').run(
    month.id,
    month.userId,
    month.monthKey,
    month.now,
  )
}

export function countMonths(db: Database, userId: string): number {
  return db.prepare('SELECT count(*) AS n FROM months WHERE user_id = ?').get(userId)?.n as number
}

/** Its categories and entries go with it (ON DELETE CASCADE). */
export function deleteMonth(db: Database, userId: string, monthId: string): void {
  db.prepare('DELETE FROM months WHERE id = ? AND user_id = ?').run(monthId, userId)
}

/** Integer sums, so they are exact. */
export function monthTotals(db: Database, userId: string, monthId: string): Totals {
  const row = db
    .prepare(
      `SELECT
         coalesce(sum(CASE WHEN type = 'income' THEN amount_bani END), 0) AS income,
         coalesce(sum(CASE WHEN type = 'expense' THEN amount_bani END), 0) AS expense
       FROM entries WHERE month_id = ? AND user_id = ?`,
    )
    .get(monthId, userId)
  return { incomeBani: row?.income as number, expenseBani: row?.expense as number }
}

// ── Categories ───────────────────────────────────────────────────────────────

export function listCategories(db: Database, userId: string, monthId: string): CategoryRow[] {
  return db
    .prepare('SELECT id, name FROM categories WHERE month_id = ? AND user_id = ? ORDER BY sort_order, rowid')
    .all(monthId, userId)
    .map((row) => ({ id: row.id as string, name: row.name as string }))
}

// ── Entries ──────────────────────────────────────────────────────────────────

export function countEntries(db: Database, userId: string, monthId: string): number {
  return db.prepare('SELECT count(*) AS n FROM entries WHERE month_id = ? AND user_id = ?').get(monthId, userId)
    ?.n as number
}

/** The month's entries in their order within each category. */
export function listEntries(db: Database, userId: string, monthId: string): EntryRow[] {
  return db
    .prepare(
      `SELECT id, category_id, description, type, amount_bani FROM entries
       WHERE month_id = ? AND user_id = ? ORDER BY sort_order, rowid`,
    )
    .all(monthId, userId)
    .map((row) => ({
      id: row.id as string,
      categoryId: row.category_id as string,
      description: row.description as string,
      type: row.type as EntryType,
      amountBani: row.amount_bani as number,
    }))
}
