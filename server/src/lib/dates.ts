/* Calendar arithmetic on plain dates (YYYY-MM-DD) and month keys (YYYY-MM).
   Done in UTC, where every day has 24 hours, so no time zone shifts a day. */

/** The month key `count` months after `monthKey`. */
export function addMonths(monthKey: string, count: number): string {
  const index = Number(monthKey.slice(0, 4)) * 12 + Number(monthKey.slice(5, 7)) - 1 + count
  return `${String(Math.floor(index / 12)).padStart(4, '0')}-${String((index % 12) + 1).padStart(2, '0')}`
}

export function addDays(date: string, days: number): string {
  const time = Date.parse(`${date}T00:00:00Z`) + days * 86_400_000
  return new Date(time).toISOString().slice(0, 10)
}

/** Whole days from `from` to `to`; negative when `to` comes first. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}

/** 0 for Monday to 6 for Sunday. */
export function weekday(date: string): number {
  return (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7
}
