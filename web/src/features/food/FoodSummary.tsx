import { Pencil, Wallet } from 'lucide-react'
import { useI18n } from '../../lib/i18n.tsx'
import { Button } from '../../ui/Button.tsx'
import { Money } from '../../ui/Money.tsx'
import { ProgressBar } from '../../ui/ProgressBar.tsx'
import { monthName } from '../budget/month-key.ts'
import type { FoodMonth } from './food-api.ts'
import { fill, percent } from './food-format.ts'

/* The panels around a food month: what is left of the month and of each
   source. */

const panel = 'card p-4 sm:p-5'
const heading = 'font-sans text-sm font-semibold text-muted'
const hero = 'font-display text-3xl font-semibold tracking-tight text-brand-deep sm:text-4xl'

/** What is left of the month. The hero when no week is running (a past or future month). */
export function MonthPanel({ data, compact }: { data: FoodMonth; compact: boolean }) {
  const { t, language } = useI18n()
  const over = data.remainingBani < 0
  return (
    <section aria-labelledby="food-month-left" className={panel}>
      <header className="flex items-baseline justify-between gap-3">
        <h2 id="food-month-left" className={heading}>
          {t('food.leftIn', { month: monthName(data.monthKey, language) })}
        </h2>
        <span className="text-xs text-muted tabular-nums">
          {t('food.spentShare', { percent: Math.round(percent(data.spentBani, data.totalBani)) })}
        </span>
      </header>
      <p className="mt-2 flex flex-wrap items-baseline gap-x-2">
        <Money
          bani={data.remainingBani}
          signed
          tone={over ? 'expense' : 'plain'}
          className={compact ? 'font-display text-2xl font-semibold text-brand-deep' : hero}
        />
        <span className="text-sm text-muted">{fill(t('food.ofTotal'), { amount: <Money bani={data.totalBani} /> })}</span>
      </p>
      <div className="mt-3">
        <ProgressBar value={data.spentBani} max={data.totalBani} label={t('food.monthProgress')} tone={over ? 'over' : 'brand'} />
      </div>
    </section>
  )
}

export function SourcesPanel({ data, onEdit }: { data: FoodMonth; onEdit: () => void }) {
  const { t } = useI18n()
  return (
    <section aria-labelledby="food-sources" className={panel}>
      <header className="-mt-2 mb-2 flex items-center justify-between">
        <h2 id="food-sources" className={heading}>
          {t('food.sources')}
        </h2>
        <Button variant="quiet" className="-mr-3 px-3" onClick={onEdit} aria-label={t('food.editSourcesLabel')}>
          <Pencil />
          {t('food.editSources')}
        </Button>
      </header>
      <ul className="flex flex-col gap-3.5">
        {data.sources.map((source) => {
          const over = source.remainingBani < 0
          return (
            <li key={source.id}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2 font-semibold">
                  <Wallet aria-hidden="true" className="size-4 shrink-0 text-muted" />
                  <span className="truncate">{source.name}</span>
                </span>
                <span className="text-sm whitespace-nowrap">
                  <Money bani={source.remainingBani} signed tone={over ? 'expense' : 'plain'} className="font-semibold" />
                  <span className="text-muted">
                    {' / '}
                    <Money bani={source.amountBani} bare />
                  </span>
                </span>
              </div>
              <div className="mt-1.5">
                <ProgressBar
                  value={source.spentBani}
                  max={source.amountBani}
                  label={t('food.sourceProgress', { name: source.name })}
                  tone={over ? 'over' : 'brand'}
                />
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
