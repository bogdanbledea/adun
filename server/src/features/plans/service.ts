import { randomUUID } from 'node:crypto'
import { transaction, type Database } from '../../db.ts'
import { conflict, notFound } from '../../http/errors.ts'
import { addMonths } from '../../lib/dates.ts'
import { LIMITS, limitReached } from '../../lib/limits.ts'
import { logActivity } from '../activity/service.ts'
import * as budget from '../budget/repository.ts'
import { checkMonthCount, checkMonthLimits, findOrCreateCategory } from '../budget/service.ts'
import * as repo from './repository.ts'

/* Payment plans: a purchase paid in monthly instalments.
   - A plan is 1–360 instalments of a total above zero, in bani. The first
     instalment takes what does not divide: 2000.00 / 3 → 666.68, 666.66,
     666.66.
   - Creating a plan puts one expense named after it in each month from the
     first one on, numbered 1…n, in the plan's category: missing months are
     created, the category is found by name or added last, and the
     instalment goes after the category's last entry.
   - An instalment counts as paid once its month has come. The client says
     which month it is in, so the server needs no time zone.
   - Closing deletes the instalments of the months after the current one
     and marks the plan closed. Only a closed plan can be deleted, which
     takes every instalment with it, past ones included. Categories left
     without entries go, as they do when their last entry is deleted.
   - An account holds at most LIMITS.plans plans, and instalments count
     towards each month's limits; a plan that would pass one adds nothing.
   - Each change and its activity entry are one transaction. */

export interface Plan {
  id: string
  name: string
  installmentCount: number
  totalBani: number
  /** The regular instalment; the first may be a few bani more. */
  installmentBani: number
  firstMonthKey: string
  categoryName: string
  /** When the item was bought or the contract signed. */
  purchaseDate: string | null
  closedAt: string | null
  createdAt: string
  paidInstallments: number
  remainingInstallments: number
}

export interface Installment {
  id: string
  index: number
  monthKey: string
  amountBani: number
  paid: boolean
}

export interface PlanDetail extends Plan {
  installments: Installment[]
}

const planNotFound = () => notFound('plan_not_found', 'Payment plan not found.')
const planOpen = () => conflict('plan_open', 'Close the payment plan before deleting it.')

/** Splits a total into n instalments of whole bani; the first takes the remainder. */
export function splitInstallments(totalBani: number, n: number): number[] {
  const regular = Math.floor(totalBani / n)
  return Array.from({ length: n }, (_, i) => (i === 0 ? totalBani - regular * (n - 1) : regular))
}

function toPlan(row: repo.PlanRow): Plan {
  return { ...row, installmentBani: Math.floor(row.totalBani / row.installmentCount) }
}

function requirePlan(db: Database, userId: string, id: string, currentMonth: string): repo.PlanRow {
  const plan = repo.findPlan(db, userId, id, currentMonth)
  if (!plan) throw planNotFound()
  return plan
}

export function listPlans(db: Database, userId: string, currentMonth: string): Plan[] {
  return repo.listPlans(db, userId, currentMonth).map(toPlan)
}

export function readPlan(db: Database, userId: string, id: string, currentMonth: string): PlanDetail {
  const plan = toPlan(requirePlan(db, userId, id, currentMonth))
  const installments = repo
    .listInstallments(db, userId, id)
    .map((row) => ({ ...row, paid: row.monthKey <= currentMonth }))
  return { ...plan, installments }
}

export interface NewPlanInput {
  name: string
  installmentCount: number
  totalBani: number
  firstMonthKey: string
  categoryName: string
  purchaseDate: string | null
}

export function createPlan(db: Database, userId: string, input: NewPlanInput, currentMonth: string): Plan {
  return transaction(db, () => {
    if (repo.countPlans(db, userId) >= LIMITS.plans) throw limitReached()
    const id = randomUUID()
    const now = new Date().toISOString()
    repo.insertPlan(db, { id, userId, ...input, now })

    splitInstallments(input.totalBani, input.installmentCount).forEach((amountBani, i) => {
      const monthKey = addMonths(input.firstMonthKey, i)
      let monthId = budget.findMonth(db, userId, monthKey)?.id
      if (!monthId) {
        monthId = randomUUID()
        budget.insertMonth(db, { id: monthId, userId, monthKey, now })
      }
      budget.insertEntry(db, {
        id: randomUUID(),
        userId,
        monthId,
        categoryId: findOrCreateCategory(db, userId, monthId, input.categoryName),
        description: input.name,
        type: 'expense',
        amountBani,
        now,
        installment: { planId: id, index: i + 1 },
      })
      checkMonthLimits(db, userId, monthId)
    })
    checkMonthCount(db, userId)

    logActivity(db, userId, 'plan.created', {
      name: input.name,
      installments: input.installmentCount,
      totalBani: input.totalBani,
      firstMonthKey: input.firstMonthKey,
    })
    return toPlan(requirePlan(db, userId, id, currentMonth))
  })
}

export function setPurchaseDate(
  db: Database,
  userId: string,
  id: string,
  purchaseDate: string | null,
  currentMonth: string,
): Plan {
  return transaction(db, () => {
    requirePlan(db, userId, id, currentMonth)
    repo.setPurchaseDate(db, userId, id, purchaseDate)
    return toPlan(requirePlan(db, userId, id, currentMonth))
  })
}

// Removes the categories the plan's instalments were in, once empty.
function deleteInstallments(db: Database, userId: string, planId: string, remove: () => number): number {
  const categoryIds = repo.installmentCategoryIds(db, userId, planId)
  const deleted = remove()
  for (const categoryId of categoryIds) budget.deleteCategoryIfEmpty(db, userId, categoryId)
  return deleted
}

/** Deletes the instalments still to come; closing a closed plan changes nothing. */
export function closePlan(db: Database, userId: string, id: string, currentMonth: string): Plan {
  return transaction(db, () => {
    const plan = requirePlan(db, userId, id, currentMonth)
    if (plan.closedAt) return toPlan(plan)
    const deletedInstallments = deleteInstallments(db, userId, id, () =>
      repo.deleteInstallmentsAfter(db, userId, id, currentMonth),
    )
    repo.setClosed(db, userId, id, new Date().toISOString())
    logActivity(db, userId, 'plan.closed', { name: plan.name, deletedInstallments })
    return toPlan(requirePlan(db, userId, id, currentMonth))
  })
}

/** Deletes a closed plan with every instalment it left in the budget. */
export function deletePlan(db: Database, userId: string, id: string): void {
  transaction(db, () => {
    // Any month will do: the counts of paid instalments are not used here.
    const plan = requirePlan(db, userId, id, '0000-01')
    if (!plan.closedAt) throw planOpen()
    const deletedInstallments = deleteInstallments(db, userId, id, () => repo.deletePlan(db, userId, id))
    logActivity(db, userId, 'plan.deleted', { name: plan.name, deletedInstallments })
  })
}
