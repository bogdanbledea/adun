import type { Database } from '../../db.ts'

/* SQL for months, categories and entries. Every function takes the user ID
   and filters by it, so one user's IDs never reach another's rows. The
   template is a row in months with is_template = 1 and no month key; its
   categories and entries are like a month's. */

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
  /** When it was actually paid; null when not given, and always in the template. */
  paymentDate: string | null
  /** Set on a payment plan's instalment: number `index` of `total`. */
  plan: { id: string; name: string; index: number; total: number } | null
}

/** An entry with its month and category. */
export interface FullEntryRow extends EntryRow {
  monthId: string
  /** null: the template. */
  monthKey: string | null
  categoryName: string
}

export interface Totals {
  incomeBani: number
  expenseBani: number
}

// ── Months ───────────────────────────────────────────────────────────────────

/** Oldest first, the template aside. */
export function listMonthKeys(db: Database, userId: string): string[] {
  return db
    .prepare('SELECT month_key FROM months WHERE user_id = ? AND is_template = 0 ORDER BY month_key')
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

/** The template does not count. */
export function countMonths(db: Database, userId: string): number {
  return db.prepare('SELECT count(*) AS n FROM months WHERE user_id = ? AND is_template = 0').get(userId)?.n as number
}

export function findTemplateId(db: Database, userId: string): string | null {
  const row = db.prepare('SELECT id FROM months WHERE user_id = ? AND is_template = 1').get(userId)
  return row ? (row.id as string) : null
}

export function insertTemplate(db: Database, template: { id: string; userId: string; now: string }): void {
  db.prepare('INSERT INTO months (id, user_id, is_template, created_at) VALUES (?, ?, 1, ?)').run(
    template.id,
    template.userId,
    template.now,
  )
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

export function countCategories(db: Database, userId: string, monthId: string): number {
  return db.prepare('SELECT count(*) AS n FROM categories WHERE month_id = ? AND user_id = ?').get(monthId, userId)
    ?.n as number
}

export function findCategoryByName(db: Database, userId: string, monthId: string, name: string): CategoryRow | null {
  const row = db
    .prepare('SELECT id, name FROM categories WHERE month_id = ? AND user_id = ? AND name = ?')
    .get(monthId, userId, name)
  return row ? { id: row.id as string, name: row.name as string } : null
}

/** Adds a category after the month's last one. */
export function insertCategory(db: Database, category: { id: string; userId: string; monthId: string; name: string }): void {
  db.prepare(
    `INSERT INTO categories (id, user_id, month_id, name, sort_order)
     VALUES (?, ?, ?, ?, (SELECT coalesce(max(sort_order) + 1, 0) FROM categories WHERE month_id = ?))`,
  ).run(category.id, category.userId, category.monthId, category.name, category.monthId)
}

export function findCategory(db: Database, userId: string, id: string): { id: string; monthId: string } | null {
  const row = db.prepare('SELECT id, month_id FROM categories WHERE id = ? AND user_id = ?').get(id, userId)
  return row ? { id: row.id as string, monthId: row.month_id as string } : null
}

export function setCategoryOrder(db: Database, userId: string, id: string, sortOrder: number): void {
  db.prepare('UPDATE categories SET sort_order = ? WHERE id = ? AND user_id = ?').run(sortOrder, id, userId)
}

/** A category lives as long as it has entries. */
export function deleteCategoryIfEmpty(db: Database, userId: string, id: string): void {
  db.prepare(
    `DELETE FROM categories
     WHERE id = ? AND user_id = ? AND NOT EXISTS (SELECT 1 FROM entries WHERE category_id = categories.id)`,
  ).run(id, userId)
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
      `SELECT e.id, e.category_id, e.description, e.type, e.amount_bani, e.payment_date, e.plan_id, e.installment_index,
              p.name AS plan_name, p.installments AS plan_total
       FROM entries e LEFT JOIN payment_plans p ON p.id = e.plan_id AND p.user_id = e.user_id
       WHERE e.month_id = ? AND e.user_id = ? ORDER BY e.sort_order, e.rowid`,
    )
    .all(monthId, userId)
    .map((row) => ({
      id: row.id as string,
      categoryId: row.category_id as string,
      description: row.description as string,
      type: row.type as EntryType,
      amountBani: row.amount_bani as number,
      paymentDate: row.payment_date as string | null,
      plan: planOf(row),
    }))
}

function planOf(row: Record<string, unknown>): EntryRow['plan'] {
  if (row.plan_id === null) return null
  return {
    id: row.plan_id as string,
    name: row.plan_name as string,
    index: row.installment_index as number,
    total: row.plan_total as number,
  }
}

/** How many of the month's entries are payment plan instalments. */
export function countInstallments(db: Database, userId: string, monthId: string): number {
  return db
    .prepare('SELECT count(*) AS n FROM entries WHERE month_id = ? AND user_id = ? AND plan_id IS NOT NULL')
    .get(monthId, userId)?.n as number
}

/** Deletes the month's entries that are not instalments, and the categories left empty; returns how many entries. */
export function deleteOwnEntries(db: Database, userId: string, monthId: string): number {
  const { changes } = db
    .prepare('DELETE FROM entries WHERE month_id = ? AND user_id = ? AND plan_id IS NULL')
    .run(monthId, userId)
  db.prepare(
    `DELETE FROM categories
     WHERE month_id = ? AND user_id = ? AND NOT EXISTS (SELECT 1 FROM entries WHERE category_id = categories.id)`,
  ).run(monthId, userId)
  return Number(changes)
}

export function findEntry(db: Database, userId: string, id: string): FullEntryRow | null {
  const row = db
    .prepare(
      `SELECT e.id, e.month_id, m.month_key, e.category_id, c.name AS category_name, e.description, e.type, e.amount_bani,
              e.payment_date, e.plan_id, e.installment_index, p.name AS plan_name, p.installments AS plan_total
       FROM entries e
       JOIN months m ON m.id = e.month_id
       JOIN categories c ON c.id = e.category_id
       LEFT JOIN payment_plans p ON p.id = e.plan_id AND p.user_id = e.user_id
       WHERE e.id = ? AND e.user_id = ?`,
    )
    .get(id, userId)
  if (!row) return null
  return {
    id: row.id as string,
    monthId: row.month_id as string,
    monthKey: row.month_key as string | null,
    categoryId: row.category_id as string,
    categoryName: row.category_name as string,
    description: row.description as string,
    type: row.type as EntryType,
    amountBani: row.amount_bani as number,
    paymentDate: row.payment_date as string | null,
    plan: planOf(row),
  }
}

export interface NewEntry {
  id: string
  userId: string
  monthId: string
  categoryId: string
  description: string
  type: EntryType
  amountBani: number
  paymentDate?: string | null
  now: string
  /** Set on a payment plan's instalment. */
  installment?: { planId: string; index: number }
}

/** Adds an entry after the category's last one. */
export function insertEntry(db: Database, entry: NewEntry): void {
  db.prepare(
    `INSERT INTO entries (id, user_id, month_id, category_id, description, type, amount_bani, payment_date, plan_id,
                          installment_index, sort_order, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, (SELECT coalesce(max(sort_order) + 1, 0) FROM entries WHERE category_id = ?), ?)`,
  ).run(
    entry.id,
    entry.userId,
    entry.monthId,
    entry.categoryId,
    entry.description,
    entry.type,
    entry.amountBani,
    entry.paymentDate ?? null,
    entry.installment?.planId ?? null,
    entry.installment?.index ?? null,
    entry.categoryId,
    entry.now,
  )
}

export interface EntryChanges {
  monthId: string
  categoryId: string
  description: string
  type: EntryType
  amountBani: number
  paymentDate: string | null
  /** Puts the entry after the last one of its (new) category. */
  appendLast: boolean
}

/** Writes every field at once; the service has merged them with the current ones. */
export function updateEntry(db: Database, userId: string, id: string, changes: EntryChanges): void {
  db.prepare(
    `UPDATE entries
     SET month_id = ?, category_id = ?, description = ?, type = ?, amount_bani = ?, payment_date = ?,
         sort_order = CASE WHEN ? THEN
           (SELECT coalesce(max(sort_order) + 1, 0) FROM entries WHERE category_id = ? AND id <> ?)
         ELSE sort_order END
     WHERE id = ? AND user_id = ?`,
  ).run(
    changes.monthId,
    changes.categoryId,
    changes.description,
    changes.type,
    changes.amountBani,
    changes.paymentDate,
    Number(changes.appendLast),
    changes.categoryId,
    id,
    id,
    userId,
  )
}

export function setEntryOrder(db: Database, userId: string, id: string, sortOrder: number): void {
  db.prepare('UPDATE entries SET sort_order = ? WHERE id = ? AND user_id = ?').run(sortOrder, id, userId)
}

export function deleteEntry(db: Database, userId: string, id: string): void {
  db.prepare('DELETE FROM entries WHERE id = ? AND user_id = ?').run(id, userId)
}
