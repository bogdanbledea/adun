import type { Language } from '../../lib/i18n.tsx'

/* A month is a key, "2026-11", as the server knows it. In the URL it is
   "11-26", shorter to read and type. */

const KEY = /^(\d{4})-(0[1-9]|1[0-2])$/
const PARAM = /^(0[1-9]|1[0-2])-(\d{2})$/

export function isMonthKey(value: string): boolean {
  return KEY.test(value)
}

/** 2026-11 → 11-26. */
export function monthKeyToParam(monthKey: string): string {
  return `${monthKey.slice(5, 7)}-${monthKey.slice(2, 4)}`
}

/** 11-26 → 2026-11, or null when the text is not one. */
export function paramToMonthKey(param: string): string | null {
  const match = PARAM.exec(param)
  return match ? `20${match[2] ?? ''}-${match[1] ?? ''}` : null
}

/** This month, in the browser's time zone. */
export function currentMonthKey(now = new Date()): string {
  return `${String(now.getFullYear())}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

/** Today as YYYY-MM-DD, in the browser's time zone. */
export function todayDate(now = new Date()): string {
  return `${currentMonthKey(now)}-${String(now.getDate()).padStart(2, '0')}`
}

/** The month `count` months after (or before, when negative). */
export function shiftMonth(monthKey: string, count: number): string {
  const [year = 0, month = 1] = monthKey.split('-').map(Number)
  return currentMonthKey(new Date(year, month - 1 + count, 1))
}

/** `before` months back to `after` months ahead of `around`, in order. */
export function monthRange(around: string, before: number, after: number): string[] {
  return Array.from({ length: before + after + 1 }, (_, i) => shiftMonth(around, i - before))
}

const locale = (language: Language) => (language === 'ro' ? 'ro-RO' : 'en-GB')

function format(monthKey: string, language: Language, options: Intl.DateTimeFormatOptions): string {
  const [year = 0, month = 1] = monthKey.split('-').map(Number)
  return new Intl.DateTimeFormat(locale(language), options).format(new Date(year, month - 1, 1))
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/** "Noiembrie 2026", "November 2026". */
export function monthLong(monthKey: string, language: Language): string {
  return capitalize(format(monthKey, language, { month: 'long', year: 'numeric' }))
}

/** The bare name for running text: "noiembrie" (Romanian keeps it lower case), "November". */
export function monthName(monthKey: string, language: Language): string {
  return format(monthKey, language, { month: 'long' })
}

/** For the strip: "Nov", and "Ian '27" outside the current year. */
export function monthShort(monthKey: string, language: Language, currentYear: string): string {
  const label = capitalize(format(monthKey, language, { month: 'short' }).replace(/\.$/, ''))
  const year = monthKey.slice(0, 4)
  return year === currentYear ? label : `${label} '${year.slice(2)}`
}

/** "3 dec.", "3 Dec": a day (YYYY-MM-DD) in a few letters. */
export function dayShort(date: string, language: Language): string {
  return new Intl.DateTimeFormat(locale(language), { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(`${date}T00:00:00Z`),
  )
}

/** "20 octombrie 2026", "20 October 2026": a day (YYYY-MM-DD) as it is, or
    the day an instant (ISO) falls on in the browser's time zone. */
export function dayLong(date: string, language: Language): string {
  const isDay = date.length === 10
  const parsed = new Date(isDay ? `${date}T00:00:00Z` : date)
  if (Number.isNaN(parsed.getTime())) return date
  return new Intl.DateTimeFormat(locale(language), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    ...(isDay ? { timeZone: 'UTC' } : {}),
  }).format(parsed)
}
