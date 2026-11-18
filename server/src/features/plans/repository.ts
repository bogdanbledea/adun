import type { Database } from '../../db.ts'

/* SQL for payment plans and their instalments (entries with plan_id set).
   Every function takes the user ID and filters by it. Whether an instalment
   is paid depends on the month the caller is in, compared with its month. */

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
  paidInstallments: number
  remainingInstallments: number
}

export interface InstallmentRow {
  id: string
  index: number
  monthKey: string
  amountBani: number
}

export interface NewPlan {
  id: string
  userId: string
  name: string
  installmentCount: number
  totalBani: number
  firstMonthKey: string
  categoryName: string
  purchaseDate: string | null
  now: string
}

/** Closed ones included. */
export function countPlans(db: Database, userId: string): number {
  return db.prepare('SELECT count(*) AS n FROM payment_plans WHERE user_id = ?').get(userId)?.n as number
}

export function insertPlan(db: Database, plan: NewPlan): void {
  db.prepare(
    `INSERT INTO payment_plans (id, user_id, name, installments, total_bani, first_month_key, category_name,
                                purchase_date, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    plan.id,
    plan.userId,
    plan.name,
    plan.installmentCount,
    plan.totalBani,
    plan.firstMonthKey,
    plan.categoryName,
    plan.purchaseDate,
    plan.now,
  )
}

// The instalments still in the budget, split by whether their month has come.
const WITH_COUNTS = `
  SELECT p.id, p.name, p.installments, p.total_bani, p.first_month_key, p.category_name, p.purchase_date,
         p.closed_at, p.created_at,
         count(m.month_key) FILTER (WHERE m.month_key <= ?) AS paid,
         count(m.month_key) FILTER (WHERE m.month_key > ?) AS remaining
  FROM payment_plans p
  LEFT JOIN entries e ON e.plan_id = p.id AND e.user_id = p.user_id
  LEFT JOIN months m ON m.id = e.month_id`

function toPlanRow(row: Record<string, unknown>): PlanRow {
  return {
    id: row.id as string,
    name: row.name as string,
    installmentCount: row.installments as number,
    totalBani: row.total_bani as number,
    firstMonthKey: row.first_month_key as string,
    categoryName: row.category_name as string,
    purchaseDate: row.purchase_date as string | null,
    closedAt: row.closed_at as string | null,
    createdAt: row.created_at as string,
    paidInstallments: row.paid as number,
    remainingInstallments: row.remaining as number,
  }
}

/** Newest first. */
export function listPlans(db: Database, userId: string, currentMonth: string): PlanRow[] {
  return db
    .prepare(`${WITH_COUNTS} WHERE p.user_id = ? GROUP BY p.id ORDER BY p.created_at DESC, p.rowid DESC`)
    .all(currentMonth, currentMonth, userId)
    .map(toPlanRow)
}

export function findPlan(db: Database, userId: string, id: string, currentMonth: string): PlanRow | null {
  const row = db
    .prepare(`${WITH_COUNTS} WHERE p.id = ? AND p.user_id = ? GROUP BY p.id`)
    .get(currentMonth, currentMonth, id, userId)
  return row ? toPlanRow(row) : null
}

/** The plan's instalments still in the budget, by number. */
export function listInstallments(db: Database, userId: string, planId: string): InstallmentRow[] {
  return db
    .prepare(
      `SELECT e.id, e.installment_index, m.month_key, e.amount_bani
       FROM entries e JOIN months m ON m.id = e.month_id
       WHERE e.plan_id = ? AND e.user_id = ?
       ORDER BY e.installment_index, e.rowid`,
    )
    .all(planId, userId)
    .map((row) => ({
      id: row.id as string,
      index: row.installment_index as number,
      monthKey: row.month_key as string,
      amountBani: row.amount_bani as number,
    }))
}

export function setPurchaseDate(db: Database, userId: string, id: string, purchaseDate: string | null): void {
  db.prepare('UPDATE payment_plans SET purchase_date = ? WHERE id = ? AND user_id = ?').run(purchaseDate, id, userId)
}

export function setClosed(db: Database, userId: string, id: string, closedAt: string): void {
  db.prepare('UPDATE payment_plans SET closed_at = ? WHERE id = ? AND user_id = ?').run(closedAt, id, userId)
}

/** Deletes the plan's instalments in months after `afterMonth`; returns how many. */
export function deleteInstallmentsAfter(db: Database, userId: string, planId: string, afterMonth: string): number {
  const { changes } = db
    .prepare(
      `DELETE FROM entries
       WHERE plan_id = ? AND user_id = ?
         AND month_id IN (SELECT id FROM months WHERE user_id = ? AND month_key > ?)`,
    )
    .run(planId, userId, userId, afterMonth)
  return Number(changes)
}

/** Deletes the plan and its instalments; returns how many instalments. */
export function deletePlan(db: Database, userId: string, planId: string): number {
  const { changes } = db.prepare('DELETE FROM entries WHERE plan_id = ? AND user_id = ?').run(planId, userId)
  db.prepare('DELETE FROM payment_plans WHERE id = ? AND user_id = ?').run(planId, userId)
  return Number(changes)
}

/** The categories holding the plan's instalments. */
export function installmentCategoryIds(db: Database, userId: string, planId: string): string[] {
  return db
    .prepare('SELECT DISTINCT category_id FROM entries WHERE plan_id = ? AND user_id = ?')
    .all(planId, userId)
    .map((row) => row.category_id as string)
}
