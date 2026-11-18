import { randomUUID } from 'node:crypto'
import { transaction, type Database } from '../../db.ts'
import { badRequest, conflict, notFound } from '../../http/errors.ts'
import { addDays, addMonths } from '../../lib/dates.ts'
import { logActivity } from '../activity/service.ts'
import { findUser } from '../user/repository.ts'
import { checkStart, currentCandidates, currentFoodMonth, ruleStart, type PeriodRule } from './period.ts'
import * as repo from './repository.ts'
import { planWeeks } from './weeks.ts'

/* Food budgets: a month's food money and where it sits.
   - A month's budget is a list of 1 to 10 sources (a card, cash, meal
     vouchers), their names different ignoring case, 0 to 1,000,000 lei
     each. The total is their sum and is never stored.
   - A month's money runs from its start to the day before the next month's
     start (period.ts). A budget keeps the start it opened with, so a later
     change of rule or calendar leaves it alone; a month without one starts
     by the user's rule. The start can be moved by hand within the limits
     checkStart sets, and never so that a purchase of this month or the
     previous one falls outside its period.
   - The current month is the one whose period holds the client's date.
   - The first save of the sources creates the budget. It stores the
     client's date as the day its weekly plan starts from, or the period's
     first day when that date is outside the period (a month set up after
     the fact).
   - A month is read whole: its totals, sources, the weekly plan for the
     client's date (weeks.ts), merchants (the most spent first) and
     purchases. A month without a budget answers its period and
     the sources of the latest earlier budget, so a new month can start from
     them.
   - Every change and its activity entry are one transaction. */

export const MAX_SOURCES = 10

export interface Period {
  start: string
  end: string
}

export const budgetNotFound = () => notFound('food_budget_not_found', 'This month has no food budget yet.')

/** "Kaufland" and "kaufland" are the same name. */
export const sameName = (name: string) => name.toLocaleLowerCase('ro-RO')

/** The user's pay-period rule. */
export function periodRule(db: Database, userId: string): PeriodRule {
  const user = findUser(db, userId)
  if (!user) throw notFound()
  return { rule: user.foodPeriodRule, paydayWorkingDay: user.foodPaydayWorkingDay }
}

/** Each month's start: stored, else by the rule. */
function startsOf(db: Database, userId: string, monthKeys: string[], rule: PeriodRule): Map<string, string> {
  const stored = repo.storedStarts(db, userId, monthKeys)
  return new Map(monthKeys.map((key) => [key, stored.get(key) ?? ruleStart(key, rule)]))
}

export function periodOf(db: Database, userId: string, monthKey: string, rule = periodRule(db, userId)): Period {
  const next = addMonths(monthKey, 1)
  const starts = startsOf(db, userId, [monthKey, next], rule)
  return { start: starts.get(monthKey) as string, end: addDays(starts.get(next) as string, -1) }
}

/** The month whose period holds `today`. */
export function currentMonth(db: Database, userId: string, today: string): string {
  return currentFoodMonth(today, startsOf(db, userId, currentCandidates(today), periodRule(db, userId)))
}

export function monthState(db: Database, userId: string, monthKey: string, today: string) {
  const rule = periodRule(db, userId)
  const period = periodOf(db, userId, monthKey, rule)
  // The rule's start, which a start moved by hand can go back to.
  const common = { monthKey, period: { ...period, ruleStart: ruleStart(monthKey, rule), rule: rule.rule } }

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
  const purchases = repo.listPurchases(db, userId, budget.id)
  const totalBani = sources.reduce((sum, s) => sum + s.amountBani, 0)
  const spentBani = purchases.reduce((sum, p) => sum + p.amountBani, 0)

  const bySource = new Map<string, number>()
  const byMerchant = new Map<string, { name: string; totalBani: number; count: number }>()
  for (const p of purchases) {
    bySource.set(p.sourceId, (bySource.get(p.sourceId) ?? 0) + p.amountBani)
    // Purchases come newest first, so the newest spelling names the merchant.
    const merchant = byMerchant.get(sameName(p.merchant)) ?? { name: p.merchant, totalBani: 0, count: 0 }
    merchant.totalBani += p.amountBani
    merchant.count += 1
    byMerchant.set(sameName(p.merchant), merchant)
  }
  const sourceNames = new Map(sources.map((s) => [s.id, s.name]))
  const { weeks, current } = planWeeks(period, totalBani, purchases, { today, planFrom: budget.planFrom })

  return {
    ...common,
    exists: true as const,
    totalBani,
    spentBani,
    remainingBani: totalBani - spentBani,
    sources: sources.map((s) => {
      const spent = bySource.get(s.id) ?? 0
      return { ...s, spentBani: spent, remainingBani: s.amountBani - spent }
    }),
    weeks,
    currentWeek: current,
    merchants: [...byMerchant.values()].sort((a, b) => b.totalBani - a.totalBani),
    purchases: purchases.map((p) => ({ ...p, sourceName: sourceNames.get(p.sourceId) ?? '' })),
  }
}

export type MonthState = ReturnType<typeof monthState>

export interface SourceInput {
  /** Left out for a new source. */
  id?: string
  name: string
  amountBani: number
}

const START_PROBLEMS = {
  out_of_range: () => badRequest('food_period_out_of_range', 'The period must start near the start of the month.'),
  before_previous: () => badRequest('food_period_before_previous', 'The period would start before the previous month’s.'),
  after_next: () => badRequest('food_period_after_next', 'The period would start after the next month’s.'),
}

/** Saves the month's sources as one list, creating the budget on the first
    save: rows with an ID are changed, rows without are added, and rows left
    out are removed unless something was paid from them. `periodStart` moves
    the month's start; left out, the start stays. */
export function saveSources(
  db: Database,
  userId: string,
  monthKey: string,
  { sources, periodStart, today }: { sources: SourceInput[]; periodStart?: string; today: string },
): MonthState {
  const names = sources.map((s) => sameName(s.name))
  if (new Set(names).size !== names.length) throw badRequest('food_duplicate_source', 'Two sources have the same name.')
  const ids = sources.flatMap((s) => (s.id ? [s.id] : []))
  if (new Set(ids).size !== ids.length) throw badRequest('invalid_input', 'Invalid value: sources.')

  return transaction(db, () => {
    const now = new Date().toISOString()
    const rule = periodRule(db, userId)
    let budget = repo.findBudget(db, userId, monthKey)
    const period = periodOf(db, userId, monthKey, rule)
    const start = periodStart ?? period.start

    if (start !== period.start) {
      const previousMonthKey = addMonths(monthKey, -1)
      const problem = checkStart(monthKey, start, {
        previousStart: startsOf(db, userId, [previousMonthKey], rule).get(previousMonthKey) as string,
        nextStart: addDays(period.end, 1),
      })
      if (problem) throw START_PROBLEMS[problem]()
      // Moving a start also moves the previous month's end.
      if (repo.hasPurchasesOutside(db, userId, { monthKey, previousMonthKey }, start)) {
        throw conflict(
          'food_purchases_outside_period',
          'Some purchases would fall outside their period. Change their dates first.',
        )
      }
    }

    if (!budget) {
      const planFrom = today >= start && today <= period.end ? today : start
      budget = { id: randomUUID(), monthKey, periodStart: start, planFrom }
      repo.insertBudget(db, { ...budget, userId, now })
    } else if (budget.periodStart !== start) {
      repo.setPeriodStart(db, userId, budget.id, start)
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
    return monthState(db, userId, monthKey, today)
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
