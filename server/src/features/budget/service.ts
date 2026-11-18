import { randomUUID } from 'node:crypto'
import { transaction, type Database } from '../../db.ts'
import { badRequest, conflict, notFound } from '../../http/errors.ts'
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
   - Reordering is in order.ts.
   - The template holds the entries a new month can start from. Its row is
     made with its first entry, and its entries are changed, deleted and
     reordered like a month's, but stay in the template. It counts as a
     month for the limits on categories and entries, not for the number of
     months.
   - A payment plan's instalments are expenses in the plan's months: one
     can be edited, reordered or deleted, but not moved to another month or
     made income. Copies leave them out. Deleting a month that holds some
     keeps the month with them, and deletes only its own entries.
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
  paymentDate: string | null
  /** Set on a payment plan's instalment. */
  plan: repo.EntryRow['plan']
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

export interface Template {
  categories: Category[]
}

/** An entry on its own, as it is answered after a change. */
export interface SavedEntry extends Entry {
  /** null: the template. */
  monthKey: string | null
  categoryName: string
}

export const monthExists = () => conflict('month_exists', 'This month already has a budget.')
const monthNotFound = () => notFound('month_not_found', 'This month has no budget yet.')
export const entryNotFound = () => notFound('entry_not_found', 'Entry not found.')

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

// Every category of the month (or template) in order, each with its entries.
function categoriesOf(db: Database, userId: string, monthId: string): Category[] {
  const entries = repo.listEntries(db, userId, monthId)
  return repo.listCategories(db, userId, monthId).map((category) => ({
    ...category,
    entries: entries
      .filter((entry) => entry.categoryId === category.id)
      .map(({ id, description, type, amountBani, paymentDate, plan }) => ({ id, description, type, amountBani, paymentDate, plan })),
  }))
}

/** The month with every category in order, each with its entries, and the totals. */
export function readMonth(db: Database, userId: string, monthKey: string): Month {
  const month = requireMonth(db, userId, monthKey)
  const { incomeBani, expenseBani } = repo.monthTotals(db, userId, month.id)
  return {
    monthKey,
    categories: categoriesOf(db, userId, month.id),
    totals: { incomeBani, expenseBani, balanceBani: incomeBani - expenseBani },
  }
}

/** Empty until its first entry. */
export function readTemplate(db: Database, userId: string): Template {
  const id = repo.findTemplateId(db, userId)
  return { categories: id ? categoriesOf(db, userId, id) : [] }
}

function templateId(db: Database, userId: string): string {
  const existing = repo.findTemplateId(db, userId)
  if (existing) return existing
  const id = randomUUID()
  repo.insertTemplate(db, { id, userId, now: new Date().toISOString() })
  return id
}

export function createMonth(db: Database, userId: string, monthKey: string): Month {
  return transaction(db, () => {
    if (repo.findMonth(db, userId, monthKey)) throw monthExists()
    repo.insertMonth(db, { id: randomUUID(), userId, monthKey, now: new Date().toISOString() })
    checkMonthCount(db, userId)
    logActivity(db, userId, 'month.created', { monthKey })
    return readMonth(db, userId, monthKey)
  })
}

export interface MonthDeletion {
  entries: number
  /** Instalments kept, with the month; 0 when the month went. */
  keptInstallments: number
}

/** Removes the month with all its categories and entries. A month holding
    instalments stays with them: only its own entries and the categories
    left empty go, since the instalments belong to their plan. */
export function deleteMonth(db: Database, userId: string, monthKey: string): MonthDeletion {
  return transaction(db, () => {
    const month = requireMonth(db, userId, monthKey)
    const keptInstallments = repo.countInstallments(db, userId, month.id)
    if (keptInstallments > 0) {
      const entries = repo.deleteOwnEntries(db, userId, month.id)
      logActivity(db, userId, 'month.cleared', { monthKey, entries, keptInstallments })
      return { entries, keptInstallments }
    }
    const entries = repo.countEntries(db, userId, month.id)
    repo.deleteMonth(db, userId, month.id)
    logActivity(db, userId, 'month.deleted', { monthKey, entries })
    return { entries, keptInstallments }
  })
}

// ── Entries ──────────────────────────────────────────────────────────────────

function toSavedEntry(row: repo.FullEntryRow): SavedEntry {
  const { id, monthKey, categoryName, description, type, amountBani, paymentDate, plan } = row
  return { id, monthKey, categoryName, description, type, amountBani, paymentDate, plan }
}

// What the activity history shows for an entry: the user's own data, never
// logged. A template entry has a null monthKey.
function entryActivity(row: repo.FullEntryRow) {
  return {
    description: row.description,
    category: row.categoryName,
    type: row.type,
    amountBani: row.amountBani,
    monthKey: row.monthKey,
  }
}

export function findOrCreateCategory(db: Database, userId: string, monthId: string, name: string): string {
  const existing = repo.findCategoryByName(db, userId, monthId, name)
  if (existing) return existing.id
  const id = randomUUID()
  repo.insertCategory(db, { id, userId, monthId, name })
  return id
}

export interface NewEntryInput {
  /** null: the template. */
  monthKey: string | null
  categoryName: string
  description: string
  type: repo.EntryType
  amountBani: number
  /** Never on a template entry. */
  paymentDate?: string | null
}

const templatePaymentDate = () => badRequest('template_payment_date', 'A template entry has no payment date.')

export function createEntry(db: Database, userId: string, input: NewEntryInput): SavedEntry {
  return transaction(db, () => {
    if (input.monthKey === null && input.paymentDate) throw templatePaymentDate()
    const monthId = input.monthKey === null ? templateId(db, userId) : requireMonth(db, userId, input.monthKey).id
    const id = randomUUID()
    repo.insertEntry(db, {
      id,
      userId,
      monthId,
      categoryId: findOrCreateCategory(db, userId, monthId, input.categoryName),
      description: input.description,
      type: input.type,
      amountBani: input.amountBani,
      paymentDate: input.paymentDate ?? null,
      now: new Date().toISOString(),
    })
    checkMonthLimits(db, userId, monthId)
    const created = repo.findEntry(db, userId, id) as repo.FullEntryRow
    logActivity(db, userId, 'entry.created', entryActivity(created))
    return toSavedEntry(created)
  })
}

/** Any of the fields; another month moves the entry there. */
export type EntryUpdate = Partial<Omit<NewEntryInput, 'monthKey'>> & { monthKey?: string }

export function updateEntry(db: Database, userId: string, id: string, update: EntryUpdate): SavedEntry {
  return transaction(db, () => {
    const current = repo.findEntry(db, userId, id)
    if (!current) throw entryNotFound()
    if (current.monthKey === null && update.monthKey !== undefined) {
      throw badRequest('template_entry_move', 'A template entry stays in the template.')
    }
    if (current.monthKey === null && update.paymentDate) throw templatePaymentDate()
    if (current.plan && update.monthKey !== undefined && update.monthKey !== current.monthKey) {
      throw badRequest('installment_move', 'An instalment stays in the month its plan gave it.')
    }
    if (current.plan && update.type === 'income') {
      throw badRequest('installment_type', 'An instalment is an expense.')
    }

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
      paymentDate: update.paymentDate === undefined ? current.paymentDate : update.paymentDate,
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
