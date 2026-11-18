import type { Language } from './i18n.tsx'

/* Amounts travel and are stored as whole bani. This is where they become
   text and where typed text becomes bani again, without floating point. */

export const MAX_BANI = 999_999_999_900

const locale = (language: Language) => (language === 'ro' ? 'ro-RO' : 'en-GB')

/** "1.234,50" in Romanian, "1,234.50" in English: the number, without the unit. */
export function formatLei(bani: number, language: Language): string {
  const number = new Intl.NumberFormat(locale(language), { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  // Whole lei and bani apart, so a large amount loses nothing on the way.
  const sign = bani < 0 ? '-' : ''
  const abs = Math.abs(bani)
  return sign + number.format(Number(`${String(Math.trunc(abs / 100))}.${String(abs % 100).padStart(2, '0')}`))
}

/** "1.234,50 lei", for running text. */
export function formatBani(bani: number, language: Language): string {
  return `${formatLei(bani, language)} lei`
}

/** The amount as typed into a field: "1234.5" or "1234,50", no grouping. */
export function baniToInput(bani: number, language: Language): string {
  const text = (bani / 100).toFixed(2)
  return language === 'ro' ? text.replace('.', ',') : text
}

/* Reads what someone typed: "12", "12,5", "12.50", "1.234,50", "1,234.50",
   "1 234,50". The last "." or "," followed by one or two digits is the
   decimal mark; any other must group thousands. Returns bani, or null when
   the text is not an amount or is above the maximum. */
export function parseAmount(text: string): number | null {
  const trimmed = text.replace(/\s/g, '').replace(/lei$/i, '')
  const match = /^(\d+(?:[.,]\d{3})*)(?:([.,])(\d{1,2}))?$/.exec(trimmed)
  if (!match) return null
  const [, whole = '', mark, decimals = ''] = match
  const grouping: string[] = whole.match(/[.,]/g) ?? []
  // One kind of grouping mark, different from the decimal mark, after one to three digits.
  if (new Set(grouping).size > 1 || (mark && grouping.includes(mark))) return null
  if (grouping.length > 0 && !/^\d{1,3}[.,]/.test(whole)) return null
  const lei = whole.replace(/[.,]/g, '')
  if (lei.length > 10) return null
  const bani = Number(lei) * 100 + Number(decimals.padEnd(2, '0'))
  return bani <= MAX_BANI ? bani : null
}
