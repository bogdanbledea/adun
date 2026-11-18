import { randomUUID } from 'node:crypto'
import { transaction, type Database } from '../../db.ts'
import { badRequest, conflict, notFound } from '../../http/errors.ts'
import { addDays, addMonths } from '../../lib/dates.ts'
import { logActivity } from '../activity/service.ts'
import * as repo from './repository.ts'

/* Food budgets: a month's food money and where it sits.
   - A month's budget is a list of 1 to 10 sources (a card, cash, meal
     vouchers), their names different ignoring case, 0 to 1,000,000 lei
     each. The total is their sum and is never stored.
   - A month's money runs from its start to the day before the next month's
     start. A budget keeps the start it opened with; a month without one
     starts on the 1st.
   - The first save of the sources creates the budget. It stores the
     client's date as the day its weekly plan starts from, or the period's
     first day when that date is outside the period (a month set up after
     the fact).
   - A month without a budget answers its period and the sources of the
     latest earlier budget, so a new month can start from them.
   - Every change and its activity entry are one transaction. */

export const MAX_SOURCES = 10

export interface Period {
  start: string
  end: string
}

export const budgetNotFound = () => notFound('food_budget_not_found', 'This month has no food budget yet.')

/** "Kaufland" and "kaufland" are the same name. */
export const sameName = (name: string) => name.toLocaleLowerCase('ro-RO')

function startOf(db: Database, userId: string, monthKey: string): string {
  return repo.findBudget(db, userId, monthKey)?.periodStart ?? `${monthKey}-01`
}

export function periodOf(db: Database, userId: string, monthKey: string): Period {
  return { start: startOf(db, userId, monthKey), end: addDays(startOf(db, userId, addMonths(monthKey, 1)), -1) }
}

export function monthState(db: Database, userId: string, monthKey: string) {
  const common = { monthKey, period: periodOf(db, userId, monthKey) }

  const budget = repo.findBudget(db, userId, monthKey)
  if (!budget) {
    const previous = repo.previousBudget(db, userId, monthKey)
    return {
      ...common,
      exists: false as const,
      suggestedFrom: previous?.monthKey ?? null,
      suggestedSources: previous
        ? repo.listSources(db, userId, previous.id).map(({ name, amountBani }) => ({ name, amountBani }))
        : [],
    }
  }

  const sources = repo.listSources(db, userId, budget.id)
  return {
    ...common,
    exists: true as const,
    totalBani: sources.reduce((sum, s) => sum + s.amountBani, 0),
    sources,
  }
}

export type MonthState = ReturnType<typeof monthState>

export interface SourceInput {
  /** Left out for a new source. */
  id?: string
  name: string
  amountBani: number
}

/** Saves the month's sources as one list, creating the budget on the first
    save: rows with an ID are changed, rows without are added, and rows left
    out are removed unless something was paid from them. */
export function saveSources(
  db: Database,
  userId: string,
  monthKey: string,
  { sources, today }: { sources: SourceInput[]; today: string },
): MonthState {
  const names = sources.map((s) => sameName(s.name))
  if (new Set(names).size !== names.length) throw badRequest('food_duplicate_source', 'Two sources have the same name.')
  const ids = sources.flatMap((s) => (s.id ? [s.id] : []))
  if (new Set(ids).size !== ids.length) throw badRequest('invalid_input', 'Invalid value: sources.')

  return transaction(db, () => {
    const now = new Date().toISOString()
    let budget = repo.findBudget(db, userId, monthKey)
    if (!budget) {
      const period = periodOf(db, userId, monthKey)
      const planFrom = today >= period.start && today <= period.end ? today : period.start
      budget = { id: randomUUID(), monthKey, periodStart: period.start, planFrom }
      repo.insertBudget(db, { ...budget, userId, now })
    }

    const existing = repo.listSources(db, userId, budget.id)
    const existingIds = new Set(existing.map((s) => s.id))
    if (ids.some((id) => !existingIds.has(id))) throw badRequest('food_unknown_source', 'Unknown source.')

    const removed = existing.filter((s) => !ids.includes(s.id))
    const inUse = repo.sourceInUse(db, userId, removed.map((s) => s.id))
    if (inUse) {
      const name = removed.find((s) => s.id === inUse)?.name ?? ''
      throw conflict('food_source_in_use', `“${name}” has purchases. Move them to another source before removing it.`)
    }
    for (const source of removed) repo.deleteSource(db, userId, budget.id, source.id)

    for (const [sortOrder, source] of sources.entries()) {
      const fields = { budgetId: budget.id, name: source.name, amountBani: source.amountBani, sortOrder }
      if (source.id) repo.updateSource(db, userId, { ...fields, id: source.id })
      else repo.insertSource(db, userId, { ...fields, id: randomUUID(), now })
    }

    const totalBani = sources.reduce((sum, s) => sum + s.amountBani, 0)
    logActivity(db, userId, 'food.budget_set', { monthKey, totalBani, sources: sources.length })
    return monthState(db, userId, monthKey)
  })
}

/** Deletes the month's budget with its sources and purchases. */
export function deleteBudget(db: Database, userId: string, monthKey: string): void {
  transaction(db, () => {
    const budget = repo.findBudget(db, userId, monthKey)
    if (!budget) throw budgetNotFound()
    repo.deleteBudget(db, userId, budget.id)
    logActivity(db, userId, 'food.budget_deleted', { monthKey })
  })
}
