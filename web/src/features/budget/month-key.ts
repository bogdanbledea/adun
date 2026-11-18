import type { Language } from '../../lib/i18n.tsx'

/* A month is a key, "2026-11", the same on the server and in the URL. */

const KEY = /^(\d{4})-(0[1-9]|1[0-2])$/

export function isMonthKey(value: string): boolean {
  return KEY.test(value)
}

/** This month, in the browser's time zone. */
export function currentMonthKey(now = new Date()): string {
  return `${String(now.getFullYear())}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

/** The month `count` months after (or before, when negative). */
export function shiftMonth(monthKey: string, count: number): string {
  const [year = 0, month = 1] = monthKey.split('-').map(Number)
  return currentMonthKey(new Date(year, month - 1 + count, 1))
}

/** The twelve months of the key's year. */
export function monthsOfYear(monthKey: string): string[] {
  const year = monthKey.slice(0, 4)
  return Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`)
}

function format(monthKey: string, language: Language, options: Intl.DateTimeFormatOptions): string {
  const [year = 0, month = 1] = monthKey.split('-').map(Number)
  const text = new Intl.DateTimeFormat(language === 'ro' ? 'ro-RO' : 'en-GB', options).format(new Date(year, month - 1, 1))
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** "Noiembrie 2026", "November 2026". */
export function monthName(monthKey: string, language: Language): string {
  return format(monthKey, language, { month: 'long', year: 'numeric' })
}

/** "Nov", without the trailing dot some languages add. */
export function monthShort(monthKey: string, language: Language): string {
  return format(monthKey, language, { month: 'short' }).replace(/\.$/, '')
}
