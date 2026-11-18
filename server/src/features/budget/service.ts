import { randomUUID } from 'node:crypto'
import { transaction, type Database } from '../../db.ts'
import { conflict, notFound } from '../../http/errors.ts'
import { LIMITS, limitReached } from '../../lib/limits.ts'
import { logActivity } from '../activity/service.ts'
import * as repo from './repository.ts'

/* The monthly budget.
   - A month exists once the user creates it, and holds categories with
     their entries. An entry is income or an expense, its amount in bani.
   - An entry names its category; the month's category of that name is used,
     or added after the last one. A category goes when its last entry does.
   - New entries go after the last one of their category. Moving an entry to
     another month creates that month if needed and keeps the category name;
     changing its category or month puts it last there.
   - Balance = income − expenses, summed in SQL as integers.
   - An account holds at most LIMITS.months months, a month
     LIMITS.entriesPerMonth entries in LIMITS.categoriesPerMonth categories;
     a change that would pass one is refused whole.
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

/** An entry on its own, as it is answered after a change. */
export interface SavedEntry extends Entry {
  monthKey: string
  categoryName: string
}

const monthNotFound = () => notFound('month_not_found', 'This month has no budget yet.')
const entryNotFound = () => notFound('entry_not_found', 'Entry not found.')

export function requireMonth(db: Database, userId: string, monthKey: string): repo.MonthRow {
  const month = repo.findMonth(db, userId, monthKey)
  if (!month) throw monthNotFound()
  return month
}

/** Call inside the transaction, after adding months. */
export function checkMonthCount(db: Database, userId: string): void {
  if (repo.countMonths(db, userId) > LIMITS.months) throw limitReached()
}

/** Call inside the transaction, after adding entries or categories to the month. */
export function checkMonthLimits(db: Database, userId: string, monthId: string): void {
  if (
    repo.countEntries(db, userId, monthId) > LIMITS.entriesPerMonth ||
    repo.countCategories(db, userId, monthId) > LIMITS.categoriesPerMonth
  ) {
    throw limitReached()
  }
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

// ── Entries ──────────────────────────────────────────────────────────────────

function toSavedEntry(row: repo.FullEntryRow): SavedEntry {
  const { id, monthKey, categoryName, description, type, amountBani } = row
  return { id, monthKey, categoryName, description, type, amountBani }
}

// What the activity history shows for an entry: the user's own data, never logged.
function entryActivity(row: repo.FullEntryRow) {
  return {
    description: row.description,
    category: row.categoryName,
    type: row.type,
    amountBani: row.amountBani,
    monthKey: row.monthKey,
  }
}

function findOrCreateCategory(db: Database, userId: string, monthId: string, name: string): string {
  const existing = repo.findCategoryByName(db, userId, monthId, name)
  if (existing) return existing.id
  const id = randomUUID()
  repo.insertCategory(db, { id, userId, monthId, name })
  return id
}

export interface NewEntryInput {
  monthKey: string
  categoryName: string
  description: string
  type: repo.EntryType
  amountBani: number
}

export function createEntry(db: Database, userId: string, input: NewEntryInput): SavedEntry {
  return transaction(db, () => {
    const month = requireMonth(db, userId, input.monthKey)
    const id = randomUUID()
    repo.insertEntry(db, {
      id,
      userId,
      monthId: month.id,
      categoryId: findOrCreateCategory(db, userId, month.id, input.categoryName),
      description: input.description,
      type: input.type,
      amountBani: input.amountBani,
      now: new Date().toISOString(),
    })
    checkMonthLimits(db, userId, month.id)
    const created = repo.findEntry(db, userId, id) as repo.FullEntryRow
    logActivity(db, userId, 'entry.created', entryActivity(created))
    return toSavedEntry(created)
  })
}

export type EntryUpdate = Partial<NewEntryInput>

export function updateEntry(db: Database, userId: string, id: string, update: EntryUpdate): SavedEntry {
  return transaction(db, () => {
    const current = repo.findEntry(db, userId, id)
    if (!current) throw entryNotFound()

    let monthId = current.monthId
    const moving = update.monthKey !== undefined && update.monthKey !== current.monthKey
    if (moving) {
      const monthKey = update.monthKey as string
      const target = repo.findMonth(db, userId, monthKey)
      if (target) {
        monthId = target.id
      } else {
        monthId = randomUUID()
        repo.insertMonth(db, { id: monthId, userId, monthKey, now: new Date().toISOString() })
        checkMonthCount(db, userId)
      }
    }

    const categoryName = update.categoryName ?? current.categoryName
    const categoryId =
      moving || categoryName !== current.categoryName
        ? findOrCreateCategory(db, userId, monthId, categoryName)
        : current.categoryId

    repo.updateEntry(db, userId, id, {
      monthId,
      categoryId,
      description: update.description ?? current.description,
      type: update.type ?? current.type,
      amountBani: update.amountBani ?? current.amountBani,
      appendLast: categoryId !== current.categoryId,
    })
    if (categoryId !== current.categoryId) {
      repo.deleteCategoryIfEmpty(db, userId, current.categoryId)
      checkMonthLimits(db, userId, monthId)
    }

    const updated = repo.findEntry(db, userId, id) as repo.FullEntryRow
    if (moving) {
      logActivity(db, userId, 'entry.moved', { ...entryActivity(updated), fromMonthKey: current.monthKey })
    } else {
      logActivity(db, userId, 'entry.updated', entryActivity(updated))
    }
    return toSavedEntry(updated)
  })
}

export function deleteEntry(db: Database, userId: string, id: string): void {
  transaction(db, () => {
    const entry = repo.findEntry(db, userId, id)
    if (!entry) throw entryNotFound()
    repo.deleteEntry(db, userId, id)
    repo.deleteCategoryIfEmpty(db, userId, entry.categoryId)
    logActivity(db, userId, 'entry.deleted', entryActivity(entry))
  })
}
