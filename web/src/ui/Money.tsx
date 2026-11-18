import { useI18n } from '../lib/i18n.tsx'
import { formatLei } from '../lib/money.ts'
import { cx } from './cx.ts'

/* Every amount on the budget page renders through here: one place decides
   tabular figures, sign, colour and the unit. */

export type MoneyTone = 'plain' | 'muted' | 'income' | 'expense' | 'auto'

const TONES: Record<Exclude<MoneyTone, 'auto'>, string> = {
  plain: '',
  muted: 'text-muted',
  income: 'text-income',
  expense: 'text-expense',
}

function toneClass(tone: MoneyTone, bani: number): string {
  if (tone !== 'auto') return TONES[tone]
  if (bani > 0) return TONES.income
  if (bani < 0) return TONES.expense
  return TONES.muted
}

interface MoneyProps {
  bani: number
  /** "auto" colours by sign; "plain" inherits the surrounding colour. */
  tone?: MoneyTone
  /** Print a minus for negative values; off by default so callers can show magnitudes. */
  signed?: boolean
  className?: string
}

export function Money({ bani, tone = 'plain', signed = false, className }: MoneyProps) {
  const { language, t } = useI18n()
  return (
    <span className={cx('whitespace-nowrap tabular-nums', toneClass(tone, bani), className)}>
      {signed && bani < 0 ? '−' : ''}
      {formatLei(Math.abs(bani), language)}
      <span className="ml-1 font-normal opacity-70">{t('amounts.currency')}</span>
    </span>
  )
}
