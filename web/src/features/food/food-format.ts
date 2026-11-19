import { Fragment, createElement, type ReactNode } from 'react'
import type { Language, MessageKey, Translate } from '../../lib/i18n.tsx'
import { dayShort } from '../budget/month-key.ts'
import { takesDe } from '../reminders/kinds.ts'

/* Small helpers the food screens share. Dates are calendar days, so they are
   formatted in UTC. */

const locale = (language: Language) => (language === 'ro' ? 'ro-RO' : 'en-GB')
const utc = (date: string) => new Date(`${date}T00:00:00Z`)

/** Shops offered as one tap in the purchase dialog, before the ones already used. */
export const MERCHANT_PRESETS = ['Kaufland', 'Lidl', 'Auchan', 'Bolt Food']

const DELIVERY = /bolt|glovo|tazz|wolt|foodpanda|livrare|delivery/i

/** Delivery apps get a bike icon instead of a cart. */
export function isDelivery(merchant: string): boolean {
  return DELIVERY.test(merchant)
}

/** The same name however it was typed: "kaufland" is "Kaufland". */
export function sameName(a: string, b: string): boolean {
  return a.trim().toLocaleLowerCase('ro-RO') === b.trim().toLocaleLowerCase('ro-RO')
}

/** "2–8 nov." within a month, "26 oct. – 1 nov." across two, "30 nov." for one day. */
export function formatRange(start: string, end: string, language: Language): string {
  return new Intl.DateTimeFormat(locale(language), { day: 'numeric', month: 'short', timeZone: 'UTC' }).formatRange(
    utc(start),
    utc(end),
  )
}

/** "Marți, 3 nov.", "Tuesday, 3 Nov". */
export function formatWeekday(date: string, language: Language): string {
  const weekday = new Intl.DateTimeFormat(locale(language), { weekday: 'long', timeZone: 'UTC' }).format(utc(date))
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}, ${dayShort(date, language)}`
}

/** Today when it falls inside the period, else the nearest end of it. */
export function defaultSpentOn(period: { start: string; end: string }, today: string): string {
  if (today < period.start) return period.start
  if (today > period.end) return period.end
  return today
}

/* A counted noun has three texts: `<base>.one`, `<base>.many` and
   `<base>.manyDe` for the Romanian counts that take "de" (English repeats
   `many`). */
export type CountedNoun = 'food.count.days' | 'food.count.purchases' | 'food.count.sources' | 'family.count.members'

export function counted(t: Translate, noun: CountedNoun, count: number): string {
  if (count === 1) return t(`${noun}.one`)
  return t(`${noun}.${takesDe(count) ? 'manyDe' : 'many'}` as MessageKey, { count })
}

/** "a 3-a zi lucrătoare", "3rd working day": payday as the n-th working day (1 to 10). */
export function paydayText(t: Translate, language: Language, n: number): string {
  if (n === 1) return t('foodPeriod.ordinalFirst')
  const suffix = n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'
  return t('foodPeriod.ordinal', { n: language === 'en' ? `${String(n)}${suffix}` : String(n) })
}

/** A translated sentence with React nodes in place of its {placeholders}:
    fill(t('food.ofTotal'), { amount: <Money bani={2000} /> }). */
export function fill(text: string, values: Record<string, ReactNode>): ReactNode {
  return text
    .split(/\{(\w+)\}/)
    .map((part, i) => createElement(Fragment, { key: i }, i % 2 === 1 ? (part in values ? values[part] : `{${part}}`) : part))
}

/** Share of `whole` that `part` is, 0 to 100, for percentages. */
export function percent(part: number, whole: number): number {
  if (whole <= 0) return part > 0 ? 100 : 0
  return Math.min(Math.max((part / whole) * 100, 0), 100)
}
