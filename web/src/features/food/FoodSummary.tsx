import { Bike, Info, Pencil, ShoppingCart, Wallet } from 'lucide-react'
import { useI18n } from '../../lib/i18n.tsx'
import { Button } from '../../ui/Button.tsx'
import { cx } from '../../ui/cx.ts'
import { Money } from '../../ui/Money.tsx'
import { ProgressBar } from '../../ui/ProgressBar.tsx'
import { monthName } from '../budget/month-key.ts'
import type { FoodCurrentWeek, FoodMonth } from './food-api.ts'
import { fill, formatRange, isDelivery, percent } from './food-format.ts'

/* The panels around a food month: the running week, which is the one
   question the screen exists to answer, the month, the sources and the
   shops. */

const STATUS_TONE = { ok: 'brand', behind: 'gold', over: 'over' } as const
const STATUS_BADGE = { ok: 'border-brand text-brand', behind: 'border-warning text-warning', over: 'border-expense text-expense' }

const panel = 'card p-4 sm:p-5'
const heading = 'font-sans text-sm font-semibold text-muted'
const hero = 'font-display text-3xl font-semibold tracking-tight text-brand-deep sm:text-4xl'

/** How much is left this week, and whether the spending is on pace. */
export function CurrentWeekPanel({ week, laterWeeks }: { week: FoodCurrentWeek; laterWeeks: number }) {
  const { t, language } = useI18n()
  const over = week.remainingBani < 0
  let hint = null
  if (over) {
    hint =
      laterWeeks === 0
        ? t('food.overHintLast')
        : fill(t(laterWeeks === 1 ? 'food.overHintOne' : 'food.overHintMany', { count: laterWeeks }), {
            amount: <Money bani={-week.remainingBani} />,
          })
  } else if (week.status === 'behind') {
    hint = fill(t('food.behindHint'), { amount: <Money bani={week.paceBani} /> })
  }

  return (
    <section aria-labelledby="food-this-week" className={panel}>
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 id="food-this-week" className={heading}>
            {t('food.thisWeek')}
          </h2>
          <p className="mt-0.5 text-xs text-muted">{formatRange(week.start, week.end, language)}</p>
        </div>
        <span className={cx('rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap', STATUS_BADGE[week.status])}>
          {t(`food.status.${week.status}`)}
        </span>
      </header>

      <p className="mt-3 flex flex-wrap items-baseline gap-x-2">
        <Money bani={week.remainingBani} signed tone={over ? 'expense' : 'plain'} className={hero} />
        <span className="text-sm text-muted">
          {fill(t(over ? 'food.overOf' : 'food.leftOf'), { amount: <Money bani={week.allowanceBani} /> })}
        </span>
      </p>

      <div className="mt-4">
        <ProgressBar
          value={week.spentBani}
          max={week.allowanceBani}
          label={t('food.weekProgress')}
          tone={STATUS_TONE[week.status]}
          marker={week.days > 1 && !over ? week.paceBani : undefined}
        />
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-3">
        <div className="min-w-0">
          <dt className="text-xs text-muted">{t('food.spent')}</dt>
          <dd className="font-display text-lg font-semibold">
            <Money bani={week.spentBani} />
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-muted">{t('food.daysLeft')}</dt>
          <dd className="font-display text-lg font-semibold tabular-nums">{week.daysLeft}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-muted">{t('food.perDay')}</dt>
          <dd className="font-display text-lg font-semibold">
            <Money bani={week.perDayLeftBani} />
          </dd>
        </div>
      </dl>

      {hint && (
        <p className="mt-3 flex items-start gap-2 border-t border-line pt-3 text-sm text-muted">
          <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-info" />
          <span>{hint}</span>
        </p>
      )}
    </section>
  )
}

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

/** Where the money went, biggest shop first. Hidden until there is a purchase. */
export function MerchantsPanel({ data }: { data: FoodMonth }) {
  const { t } = useI18n()
  const top = data.merchants[0]
  if (!top) return null
  return (
    <section aria-labelledby="food-merchants" className={panel}>
      <h2 id="food-merchants" className={cx(heading, 'mb-3')}>
        {t('food.byStore')}
      </h2>
      <ul className="flex flex-col gap-3">
        {data.merchants.map((merchant) => {
          const Icon = isDelivery(merchant.name) ? Bike : ShoppingCart
          return (
            <li key={merchant.name}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <Icon aria-hidden="true" className="size-4 shrink-0 text-muted" />
                  <span className="truncate font-semibold">{merchant.name}</span>
                  <span className="text-xs text-muted">×{merchant.count}</span>
                </span>
                <span className="whitespace-nowrap">
                  <Money bani={merchant.totalBani} className="font-semibold" />
                  <span className="ml-1.5 text-xs text-muted tabular-nums">{Math.round(percent(merchant.totalBani, data.spentBani))}%</span>
                </span>
              </div>
              <div className="mt-1.5">
                <ProgressBar value={merchant.totalBani} max={top.totalBani} label={merchant.name} tone="gold" />
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
