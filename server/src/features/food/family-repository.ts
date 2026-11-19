import type { Database } from '../../db.ts'

/* SQL for food budgets as families come and go: handing a family's budgets
   from one member to another, and back to a last member. These work on a
   family ID the family service found from the user's own membership. */

/** The family's budgets kept by `fromUserId` are kept by `toUserId` from now on. */
export function handOverFamilyBudgets(db: Database, familyId: string, fromUserId: string, toUserId: string): void {
  db.prepare('UPDATE food_budgets SET user_id = ? WHERE family_id = ? AND user_id = ?').run(toUserId, familyId, fromUserId)
}

/** Months in which the user has a personal budget and the family has one too. */
export function clashingMonths(db: Database, userId: string, familyId: string): string[] {
  return db
    .prepare(
      `SELECT mine.month_key FROM food_budgets mine
       JOIN food_budgets theirs ON theirs.family_id = ? AND theirs.month_key = mine.month_key
       WHERE mine.user_id = ? AND mine.family_id IS NULL ORDER BY mine.month_key`,
    )
    .all(familyId, userId)
    .map((row) => row.month_key as string)
}

/** Every budget of the family becomes the user's personal one. The caller
    has made sure no month clashes (clashingMonths). */
export function makeFamilyBudgetsPersonal(db: Database, familyId: string, userId: string): void {
  db.prepare('UPDATE food_budgets SET user_id = ?, family_id = NULL WHERE family_id = ?').run(userId, familyId)
}

/** Deletes every budget of the family, with their sources and purchases. */
export function deleteFamilyBudgets(db: Database, familyId: string): void {
  db.prepare('DELETE FROM food_budgets WHERE family_id = ?').run(familyId)
}

// ── Sharing ──────────────────────────────────────────────────────────────────

export interface MonthBudget {
  id: string
  monthKey: string
}

/** The user's personal budgets, latest month first. */
export function personalBudgets(db: Database, userId: string): MonthBudget[] {
  return db
    .prepare('SELECT id, month_key FROM food_budgets WHERE user_id = ? AND family_id IS NULL ORDER BY month_key DESC')
    .all(userId)
    .map((row) => ({ id: row.id as string, monthKey: row.month_key as string }))
}

/** The family's budgets for the given months. */
export function familyBudgetsIn(db: Database, familyId: string, monthKeys: string[]): MonthBudget[] {
  return db
    .prepare(
      `SELECT id, month_key FROM food_budgets
       WHERE family_id = ? AND month_key IN (SELECT value FROM json_each(?))`,
    )
    .all(familyId, JSON.stringify(monthKeys))
    .map((row) => ({ id: row.id as string, monthKey: row.month_key as string }))
}

/** A budget's total and how many purchases it has, for one of the budgets above. */
export function budgetSummary(db: Database, budgetId: string): { totalBani: number; purchaseCount: number } {
  const row = db
    .prepare(
      `SELECT (SELECT coalesce(sum(amount_bani), 0) FROM food_sources WHERE budget_id = ?) AS total_bani,
              (SELECT count(*) FROM food_purchases WHERE budget_id = ?) AS purchase_count`,
    )
    .get(budgetId, budgetId)
  return { totalBani: row?.total_bani as number, purchaseCount: row?.purchase_count as number }
}

/** Moves the user's personal budgets with these IDs into the family; the user keeps them. */
export function shareBudgets(db: Database, userId: string, familyId: string, budgetIds: string[]): void {
  db.prepare(
    `UPDATE food_budgets SET family_id = ?
     WHERE user_id = ? AND family_id IS NULL AND id IN (SELECT value FROM json_each(?))`,
  ).run(familyId, userId, JSON.stringify(budgetIds))
}
