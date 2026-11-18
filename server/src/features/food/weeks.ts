import { addDays, daysBetween, weekday } from '../../lib/dates.ts'
import type { Period } from './service.ts'

/* The weekly plan of a food month. Pure functions; money is whole bani, so
   the weeks always add up to the month exactly and the last week takes the
   remainder.

   - Weeks run Monday to Sunday, clipped to the period, so the first and last
     are usually short.
   - Each week gets what is left of the month divided by the days still
     ahead, times its own days. An overspent week shrinks every later week, a
     frugal one grows them.
   - A finished week passes on what it actually left. The running week passes
     on as if it will use at least its allowance: saving only rolls over once
     the week is over, while overspending shows in later weeks at once.
   - The plan starts on the budget's plan_from day. Weeks entirely before it
     get nothing: a budget set up on the 23rd would otherwise read the
     unlogged weeks before it as unspent and pour their money into this one. */

export type WeekState = 'past' | 'current' | 'future'
export type PaceStatus = 'ok' | 'behind' | 'over'

export interface FoodWeek {
  index: number
  start: string
  end: string
  days: number
  allowanceBani: number
  spentBani: number
  remainingBani: number
  state: WeekState
  /** A later week's allowance still depends on how the running week ends. */
  estimated: boolean
  /** Entirely before the plan starts, so never given money. */
  beforeStart: boolean
}

export interface CurrentWeek extends FoodWeek {
  daysElapsed: number
  daysLeft: number
  /** What should have been spent by the end of today to land exactly on budget. */
  paceBani: number
  perDayLeftBani: number
  status: PaceStatus
}

export interface Spending {
  spentOn: string
  amountBani: number
}

export function calendarWeeks({ start: first, end: last }: Period): { start: string; end: string; days: number }[] {
  const weeks: { start: string; end: string; days: number }[] = []
  let start = first
  while (start <= last) {
    const sunday = addDays(start, 6 - weekday(start))
    const end = sunday < last ? sunday : last
    weeks.push({ start, end, days: daysBetween(start, end) + 1 })
    start = addDays(end, 1)
  }
  return weeks
}

/** The weeks of `period` sharing `totalBani`, given the purchases so far. */
export function planWeeks(
  period: Period,
  totalBani: number,
  purchases: Spending[],
  { today, planFrom }: { today: string; planFrom: string },
): { weeks: FoodWeek[]; current: CurrentWeek | null } {
  const { start: first, end: last } = period
  const planStart = planFrom > first ? planFrom : first
  const weeks: FoodWeek[] = []
  let current: CurrentWeek | null = null
  let carry = totalBani
  let seenCurrent = false

  for (const [i, w] of calendarWeeks(period).entries()) {
    const beforeStart = w.end < planStart
    const fundedFrom = w.start > planStart ? w.start : planStart
    const fundedDays = beforeStart ? 0 : daysBetween(fundedFrom, w.end) + 1
    const daysAhead = daysBetween(fundedFrom, last) + 1
    const allowance =
      beforeStart || carry <= 0 ? 0 : w.end === last ? carry : Math.round((carry * fundedDays) / daysAhead)
    const spent = purchases
      .filter((p) => p.spentOn >= w.start && p.spentOn <= w.end)
      .reduce((sum, p) => sum + p.amountBani, 0)
    const state: WeekState = today > w.end ? 'past' : today >= w.start ? 'current' : 'future'

    const week: FoodWeek = {
      index: i + 1,
      start: w.start,
      end: w.end,
      days: w.days,
      allowanceBani: allowance,
      spentBani: spent,
      remainingBani: allowance - spent,
      state,
      estimated: state === 'future' && seenCurrent,
      beforeStart,
    }
    weeks.push(week)

    if (state === 'current') {
      seenCurrent = true
      const daysElapsed = daysBetween(fundedFrom, today) + 1
      const daysLeft = daysBetween(today, w.end) + 1
      const pace = fundedDays > 0 ? Math.round((allowance * daysElapsed) / fundedDays) : 0
      current = {
        ...week,
        daysElapsed,
        daysLeft,
        paceBani: pace,
        perDayLeftBani: Math.max(0, Math.floor((allowance - spent) / daysLeft)),
        status: spent > allowance ? 'over' : spent > pace ? 'behind' : 'ok',
      }
    }

    carry -= state === 'past' ? spent : Math.max(spent, allowance)
  }

  return { weeks, current }
}
