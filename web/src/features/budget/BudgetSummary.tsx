import { TrendingDown, TrendingUp } from 'lucide-react'
import { useI18n } from '../../lib/i18n.tsx'
import { Money } from '../../ui/Money.tsx'
import { ProgressBar } from '../../ui/ProgressBar.tsx'
import type { Totals } from './budget-api.ts'
import { monthName } from './month-key.ts'

/* The month's hero: what is left, how much of the income is spent, and
   income against expenses. Spending 85% of the income turns the bar gold,
   more than all of it red. */

type Health = 'healthy' | 'tight' | 'over'

const TONE = { healthy: 'brand', tight: 'gold', over: 'over' } as const

export function BudgetSummary({ monthKey, totals }: { monthKey: string; totals: Totals }) {
  const { t, language } = useI18n()
  const { incomeBani: income, expenseBani: spent, balanceBani: balance } = totals
  const hasIncome = income > 0
  const ratio = hasIncome ? spent / income : 0
  const health: Health = ratio > 1 || (!hasIncome && spent > 0) ? 'over' : ratio >= 0.85 ? 'tight' : 'healthy'
  const percent = hasIncome ? Math.round(ratio * 100) : spent > 0 ? null : 0
  const barLabel = percent === null ? t('budget.expensesWithoutIncome') : t('budget.spentOfIncome', { percent })

  return (
    <section aria-label={t('budget.summary')} className="card">
      <div className="grid lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
        <div className="border-b border-line p-4 sm:p-5 lg:border-r lg:border-b-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-sans text-sm font-semibold text-muted">
              {t('budget.remainingIn', { month: monthName(monthKey, language) })}
            </h2>
            {balance < 0 && (
              <span className="rounded-full border border-expense px-2 text-xs font-semibold text-expense">{t('budget.overBudget')}</span>
            )}
          </div>
          <Money
            bani={balance}
            signed
            tone={balance < 0 ? 'expense' : 'plain'}
            className="mt-2 block font-display text-3xl font-semibold tracking-tight text-brand-deep sm:text-4xl"
          />
          <p className="mt-1 max-w-md text-sm text-muted">{t('budget.afterEntries')}</p>
          <div className="mt-4">
            <ProgressBar value={percent === null ? 1 : spent} max={percent === null ? 1 : income} label={barLabel} tone={TONE[health]} />
          </div>
          {percent !== null && <p className="mt-2 text-xs text-muted tabular-nums">{barLabel}</p>}
        </div>

        <dl className="grid grid-cols-2 divide-x divide-line lg:block lg:divide-x-0 lg:divide-y">
          <div className="flex items-center justify-between gap-2 p-3.5 sm:p-4">
            <dt className="flex items-center gap-2 text-sm text-muted">
              <TrendingUp aria-hidden="true" className="hidden size-4 text-income sm:block" />
              {t('budget.income')}
            </dt>
            <dd className="text-right">
              <Money bani={income} className="font-display text-lg font-semibold sm:text-xl" />
            </dd>
          </div>
          <div className="flex items-center justify-between gap-2 p-3.5 sm:p-4">
            <dt className="flex items-center gap-2 text-sm text-muted">
              <TrendingDown aria-hidden="true" className="hidden size-4 text-expense sm:block" />
              {t('budget.expenses')}
            </dt>
            <dd className="text-right">
              <Money bani={spent} className="font-display text-lg font-semibold sm:text-xl" />
            </dd>
          </div>
        </dl>
      </div>
    </section>
  )
}
