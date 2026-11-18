import { useI18n } from '../lib/i18n.tsx'
import { formatLei } from '../lib/money.ts'
import { usePrivacy } from '../lib/privacy.tsx'
import { cx } from './cx.ts'

/* Every amount on the budget page renders through here: one place decides
   tabular figures, sign, colour, the unit and how hidden amounts are masked. */

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
  /** Leave out the "lei" unit, as in "−20 lei / 1.500". */
  bare?: boolean
  className?: string
}

export function Money({ bani, tone = 'plain', signed = false, bare = false, className }: MoneyProps) {
  const { amountsHidden } = usePrivacy()
  const { language, t } = useI18n()
  return (
    <span className={cx('whitespace-nowrap tabular-nums', toneClass(tone, bani), className)}>
      {/* A screen reader would read the blurred digits, so it hears "hidden amount" instead. */}
      <span className={cx('inline-block', amountsHidden && 'amount-masked')} aria-hidden={amountsHidden || undefined}>
        {signed && bani < 0 ? '−' : ''}
        {formatLei(Math.abs(bani), language)}
      </span>
      {amountsHidden && <span className="sr-only">{t('amounts.hidden')}</span>}
      {!bare && <span className="ml-1 font-normal opacity-70">{t('amounts.currency')}</span>}
    </span>
  )
}
