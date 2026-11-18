import { randomUUID } from 'node:crypto'
import { transaction, type Database } from '../../db.ts'
import { badRequest } from '../../http/errors.ts'
import { logActivity } from '../activity/service.ts'
import * as repo from './repository.ts'
import {
  checkMonthCount,
  checkMonthLimits,
  findOrCreateCategory,
  monthExists,
  readMonth,
  requireMonth,
  type Month,
} from './service.ts'

/* Starting a month from another one, or from the template, and importing
   one into a month that already has entries.
   - Every category of the source is taken in its order, and every entry in
     its order. The target's category of the same name is used, or one is
     added after its last; entries go after the category's own. A new month
     is empty, so it ends up an exact copy.
   - A payment plan's instalments are not copied: they belong to their plan.
   - The source is a month, which must exist, or the template, which may be
     empty. A month is not imported into itself.
   - The limits are checked once everything is copied: a copy that would
     pass one changes nothing. */

/** A month key, or 'template'. */
export type Source = string

function sourceId(db: Database, userId: string, from: Source): string | null {
  return from === 'template' ? repo.findTemplateId(db, userId) : requireMonth(db, userId, from).id
}

// Returns how many entries were copied.
function copyEntries(db: Database, userId: string, fromId: string, toId: string): number {
  const entries = repo.listEntries(db, userId, fromId).filter((entry) => entry.plan === null)
  const now = new Date().toISOString()
  for (const category of repo.listCategories(db, userId, fromId)) {
    const categoryId = findOrCreateCategory(db, userId, toId, category.name)
    for (const entry of entries.filter((entry) => entry.categoryId === category.id)) {
      repo.insertEntry(db, {
        id: randomUUID(),
        userId,
        monthId: toId,
        categoryId,
        description: entry.description,
        type: entry.type,
        amountBani: entry.amountBani,
        now,
      })
    }
  }
  return entries.length
}

export function createMonthFrom(db: Database, userId: string, monthKey: string, from: Source): Month {
  return transaction(db, () => {
    if (repo.findMonth(db, userId, monthKey)) throw monthExists()
    const fromId = sourceId(db, userId, from)
    const id = randomUUID()
    repo.insertMonth(db, { id, userId, monthKey, now: new Date().toISOString() })
    checkMonthCount(db, userId)
    const entries = fromId ? copyEntries(db, userId, fromId, id) : 0
    checkMonthLimits(db, userId, id)
    logActivity(db, userId, 'month.created', { monthKey, from, entries })
    return readMonth(db, userId, monthKey)
  })
}

/** Appends the source's entries to the month; returns how many. */
export function importInto(db: Database, userId: string, monthKey: string, from: Source): number {
  if (from === monthKey) throw badRequest('same_month', 'A month cannot be imported into itself.')
  return transaction(db, () => {
    const month = requireMonth(db, userId, monthKey)
    const fromId = sourceId(db, userId, from)
    const entries = fromId ? copyEntries(db, userId, fromId, month.id) : 0
    checkMonthLimits(db, userId, month.id)
    logActivity(db, userId, 'month.imported', { monthKey, from, entries })
    return entries
  })
}
