import { addMonths } from '../../lib/dates.ts'
import { nthWorkingDay, type CalendarOverrides } from './workdays.ts'

/* When a food month's money starts and ends. Pure functions; the service
   supplies the stored starts.

   - A month's money runs from its start to the day before the next month's
     start. Only starts are stored, so periods can neither overlap nor leave
     a gap.
   - A month's start is its budget's stored start, else the user's rule: the
     1st, or the N-th working day.
   - A start set by hand lies between the 15th of the previous month and the
     28th of this one, after the previous month's start and before the next
     month's. (The service also refuses one that would leave a purchase
     outside its period.) */

export type PeriodRuleName = 'calendar' | 'working_day'

export interface PeriodRule {
  rule: PeriodRuleName
  paydayWorkingDay: number
  overrides?: CalendarOverrides
}

export function ruleStart(monthKey: string, rule: PeriodRule): string {
  return rule.rule === 'working_day' ? nthWorkingDay(monthKey, rule.paydayWorkingDay, rule.overrides) : `${monthKey}-01`
}

export type StartProblem = 'out_of_range' | 'before_previous' | 'after_next'

/** Whether `start` may become the start of `monthKey`, given the starts of
    the months around it. Null when it may. */
export function checkStart(
  monthKey: string,
  start: string,
  neighbours: { previousStart: string; nextStart: string },
): StartProblem | null {
  // Pay comes a little early or late; a start further out is a typo.
  if (start < `${addMonths(monthKey, -1)}-15` || start > `${monthKey}-28`) return 'out_of_range'
  if (start <= neighbours.previousStart) return 'before_previous'
  if (start >= neighbours.nextStart) return 'after_next'
  return null
}

/** The months whose period may hold `today`: next, this and previous
    calendar month. With a payday rule, 2 October is still September's money. */
export function currentCandidates(today: string): [string, string, string] {
  const thisMonth = today.slice(0, 7)
  return [addMonths(thisMonth, 1), thisMonth, addMonths(thisMonth, -1)]
}

/** The latest candidate whose start has come. Periods follow one another,
    so that is the month today belongs to. */
export function currentFoodMonth(today: string, starts: ReadonlyMap<string, string>): string {
  const candidates = currentCandidates(today)
  return candidates.find((monthKey) => (starts.get(monthKey) ?? '9999-12-31') <= today) ?? candidates[2]
}
