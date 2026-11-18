import { addDays, weekday } from '../../lib/dates.ts'

/* The Romanian working calendar payday is counted on. Pure functions.

   - Working days are Monday to Friday minus the legal holidays (Codul
     muncii, art. 139). The list is the one in force since 2024, when 6 and
     7 January were added, which is why food months start in 2024. Easter
     and Pentecost follow the Orthodox calendar.
   - Each user can correct the default: an extra day off, or a holiday (or a
     weekend day) they work. A change in the law is then a correction away.
   - Holidays carry a stable key, not a name: the web app names them in the
     reader's language. */

export type HolidayKey =
  | 'new_year'
  | 'epiphany'
  | 'st_john'
  | 'union_day'
  | 'good_friday'
  | 'easter'
  | 'labour_day'
  | 'children_day'
  | 'pentecost'
  | 'assumption'
  | 'st_andrew'
  | 'national_day'
  | 'christmas'

export interface Holiday {
  date: string
  holiday: HolidayKey
}

const FIXED_HOLIDAYS: [string, HolidayKey][] = [
  ['01-01', 'new_year'],
  ['01-02', 'new_year'],
  ['01-06', 'epiphany'],
  ['01-07', 'st_john'],
  ['01-24', 'union_day'],
  ['05-01', 'labour_day'],
  ['06-01', 'children_day'],
  ['08-15', 'assumption'],
  ['11-30', 'st_andrew'],
  ['12-01', 'national_day'],
  ['12-25', 'christmas'],
  ['12-26', 'christmas'],
]

/** Orthodox Easter Sunday: Meeus' Julian algorithm, moved 13 days to the
    Gregorian calendar (right from 1900 to 2099). */
export function orthodoxEaster(year: number): string {
  const a = year % 4
  const b = year % 7
  const c = year % 19
  const d = (19 * c + 15) % 30
  const e = (2 * a + 4 * b - d + 34) % 7
  const month = Math.floor((d + e + 114) / 31)
  const day = ((d + e + 114) % 31) + 1
  return addDays(`${String(year)}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`, 13)
}

const cache = new Map<number, Holiday[]>()

/** The year's legal holidays, in date order. */
export function legalHolidays(year: number): Holiday[] {
  let list = cache.get(year)
  if (!list) {
    const easter = orthodoxEaster(year)
    list = [
      ...FIXED_HOLIDAYS.map(([monthDay, holiday]) => ({ date: `${String(year)}-${monthDay}`, holiday })),
      { date: addDays(easter, -2), holiday: 'good_friday' as const },
      { date: easter, holiday: 'easter' as const },
      { date: addDays(easter, 1), holiday: 'easter' as const },
      { date: addDays(easter, 49), holiday: 'pentecost' as const },
      { date: addDays(easter, 50), holiday: 'pentecost' as const },
    ].sort((x, y) => x.date.localeCompare(y.date))
    cache.set(year, list)
  }
  return list
}

/** A user's corrections: date → "off" (an extra day off) or "working". */
export type CalendarOverrides = ReadonlyMap<string, 'off' | 'working'>

export function isWorkingDay(date: string, overrides?: CalendarOverrides): boolean {
  const override = overrides?.get(date)
  if (override) return override === 'working'
  if (weekday(date) >= 5) return false
  return !legalHolidays(Number(date.slice(0, 4))).some((h) => h.date === date)
}

/** The n-th working day of a month (n ≥ 1). May fall in the next month when
    the corrections leave too few working days; they are limited in number,
    so the count always ends. */
export function nthWorkingDay(monthKey: string, n: number, overrides?: CalendarOverrides): string {
  if (!Number.isInteger(n) || n < 1) throw new RangeError(`Not a working-day number: ${String(n)}`)
  let day = `${monthKey}-01`
  let seen = 0
  for (;;) {
    if (isWorkingDay(day, overrides) && ++seen === n) return day
    day = addDays(day, 1)
  }
}
