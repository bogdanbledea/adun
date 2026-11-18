import { transaction, type Database } from '../../db.ts'
import { LIMITS, limitReached } from '../../lib/limits.ts'
import { logActivity } from '../activity/service.ts'
import { ruleStart } from './period.ts'
import * as repo from './repository.ts'
import { periodRule } from './service.ts'
import { isWorkingDay, legalHolidays, type HolidayKey } from './workdays.ts'

/* The working calendar payday is counted on: the legal holidays, the user's
   own corrections, and the paydays they lead to, so the effect of a change
   shows before any month uses it. Months that already have a budget keep
   their stored start. An account holds at most LIMITS.calendarDays
   corrections. */

export const FIRST_YEAR = 2024
export const LAST_YEAR = 2099

export interface CalendarDay {
  date: string
  holiday: HolidayKey | null
  legal: boolean
  override: 'off' | 'working' | null
  note: string | null
  isWorkingDay: boolean
}

export function calendarYear(db: Database, userId: string, year: number) {
  const rule = periodRule(db, userId)
  const rows = repo.listOverrides(db, userId)
  const overrides = repo.overrideMap(rows)
  const inYear = rows.filter((row) => row.date.startsWith(`${String(year)}-`))
  const legal = legalHolidays(year)
  const legalDates = new Set(legal.map((h) => h.date))

  const days: CalendarDay[] = [
    ...legal.map((h) => {
      const own = inYear.find((row) => row.date === h.date)
      return { date: h.date, holiday: h.holiday, legal: true, override: own?.kind ?? null, note: own?.note ?? null }
    }),
    ...inYear
      .filter((row) => !legalDates.has(row.date))
      .map((row) => ({ date: row.date, holiday: null, legal: false, override: row.kind, note: row.note })),
  ]
    .map((day) => ({ ...day, isWorkingDay: isWorkingDay(day.date, overrides) }))
    .sort((a, b) => a.date.localeCompare(b.date))

  const paydays = Array.from({ length: 12 }, (_, i) => {
    const monthKey = `${String(year)}-${String(i + 1).padStart(2, '0')}`
    return { monthKey, date: ruleStart(monthKey, { ...rule, overrides }) }
  })

  return { year, rule: rule.rule, paydayWorkingDay: rule.paydayWorkingDay, days, paydays }
}

/** "off" adds a day off; "working" strikes out a holiday or makes a weekend day a working day. */
export function setDay(db: Database, userId: string, date: string, kind: 'off' | 'working', note: string | null): void {
  transaction(db, () => {
    repo.upsertOverride(db, userId, { date, kind, note, now: new Date().toISOString() })
    if (repo.countOverrides(db, userId) > LIMITS.calendarDays) throw limitReached()
    logActivity(db, userId, 'calendar.day_set', { date, kind })
  })
}

/** Back to the legal default for that day. */
export function resetDay(db: Database, userId: string, date: string): void {
  transaction(db, () => {
    if (repo.deleteOverride(db, userId, date)) logActivity(db, userId, 'calendar.day_reset', { date })
  })
}
