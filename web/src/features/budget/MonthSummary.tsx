import { useI18n } from '../../lib/i18n.tsx'
import { cx } from '../../ui/cx.ts'
import type { Totals } from './budget-api.ts'
import { formatBani } from './money.ts'

/** Income, expenses and what is left, as the server summed them. */
export function MonthSummary({ totals }: { totals: Totals }) {
  const { t, language } = useI18n()
  const items = [
    { label: t('budget.income'), bani: totals.incomeBani, tone: 'text-brand' },
    { label: t('budget.expenses'), bani: totals.expenseBani, tone: 'text-ink' },
    { label: t('budget.balance'), bani: totals.balanceBani, tone: totals.balanceBani < 0 ? 'text-danger' : 'text-brand-deep' },
  ]
  return (
    <dl aria-label={t('budget.totals')} className="card grid grid-cols-3 divide-x divide-line">
      {items.map((item) => (
        <div key={item.label} className="min-w-0 px-3 py-3 sm:px-5">
          <dt className="text-xs font-semibold text-muted uppercase sm:text-sm sm:normal-case">{item.label}</dt>
          <dd className={cx('mt-1 truncate font-display text-base font-semibold tabular-nums sm:text-xl', item.tone)}>
            {formatBani(item.bani, language)}
          </dd>
        </div>
      ))}
    </dl>
  )
}
