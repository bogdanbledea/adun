import { randomUUID } from 'node:crypto'
import { transaction, type Database } from '../../db.ts'
import { conflict, notFound } from '../../http/errors.ts'
import { LIMITS, limitReached } from '../../lib/limits.ts'
import { logActivity } from '../activity/service.ts'
import * as repo from './repository.ts'

/* The monthly budget.
   - A month exists once the user creates it, and holds categories with
     their entries. An entry is income or an expense, its amount in bani.
   - Balance = income − expenses, summed in SQL as integers.
   - An account holds at most LIMITS.months months; a change that would pass
     a limit is refused whole.
   - Each change and its activity entry are one transaction. */

export interface Entry {
  id: string
  description: string
  type: repo.EntryType
  amountBani: number
}

export interface Category {
  id: string
  name: string
  entries: Entry[]
}

export interface Month {
  monthKey: string
  categories: Category[]
  totals: { incomeBani: number; expenseBani: number; balanceBani: number }
}

const monthNotFound = () => notFound('month_not_found', 'This month has no budget yet.')

export function requireMonth(db: Database, userId: string, monthKey: string): repo.MonthRow {
  const month = repo.findMonth(db, userId, monthKey)
  if (!month) throw monthNotFound()
  return month
}

/** Call inside the transaction, after adding months. */
export function checkMonthCount(db: Database, userId: string): void {
  if (repo.countMonths(db, userId) > LIMITS.months) throw limitReached()
}

export function listMonths(db: Database, userId: string): string[] {
  return repo.listMonthKeys(db, userId)
}

/** The month with every category in order, each with its entries, and the totals. */
export function readMonth(db: Database, userId: string, monthKey: string): Month {
  const month = requireMonth(db, userId, monthKey)
  const entries = repo.listEntries(db, userId, month.id)
  const categories = repo.listCategories(db, userId, month.id).map((category) => ({
    ...category,
    entries: entries
      .filter((entry) => entry.categoryId === category.id)
      .map(({ id, description, type, amountBani }) => ({ id, description, type, amountBani })),
  }))
  const { incomeBani, expenseBani } = repo.monthTotals(db, userId, month.id)
  return { monthKey, categories, totals: { incomeBani, expenseBani, balanceBani: incomeBani - expenseBani } }
}

export function createMonth(db: Database, userId: string, monthKey: string): Month {
  return transaction(db, () => {
    if (repo.findMonth(db, userId, monthKey)) throw conflict('month_exists', 'This month already has a budget.')
    repo.insertMonth(db, { id: randomUUID(), userId, monthKey, now: new Date().toISOString() })
    checkMonthCount(db, userId)
    logActivity(db, userId, 'month.created', { monthKey })
    return readMonth(db, userId, monthKey)
  })
}

/** Removes the month with all its categories and entries; returns how many entries went. */
export function deleteMonth(db: Database, userId: string, monthKey: string): number {
  return transaction(db, () => {
    const month = requireMonth(db, userId, monthKey)
    const entries = repo.countEntries(db, userId, month.id)
    repo.deleteMonth(db, userId, month.id)
    logActivity(db, userId, 'month.deleted', { monthKey, entries })
    return entries
  })
}
