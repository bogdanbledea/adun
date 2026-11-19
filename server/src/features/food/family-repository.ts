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
