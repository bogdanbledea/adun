import { Check, ChevronDown, ChevronUp, CreditCard } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { errorText } from '../../lib/api.ts'
import { useI18n } from '../../lib/i18n.tsx'
import { cx } from '../../ui/cx.ts'
import { Money } from '../../ui/Money.tsx'
import { Notice } from '../../ui/Notice.tsx'
import { ProgressBar } from '../../ui/ProgressBar.tsx'
import { Skeleton } from '../../ui/Skeleton.tsx'
import { currentMonthKey, dayLong, monthLong } from '../budget/month-key.ts'
import { plansApi, type Plan, type PlanDetail } from './plans-api.ts'

/* One plan in the list: name and status, the monthly and total amounts,
   progress, when it was added and bought. Expanding loads its instalments. */

export function PlanRow({ plan }: { plan: Plan }) {
  const { t, language } = useI18n()
  const [expanded, setExpanded] = useState(false)
  const closed = plan.closedAt !== null
  const panelId = useId()
  const toggleLabel = t(expanded ? 'plans.hideInstallments' : 'plans.showInstallments', { name: plan.name })

  return (
    <li className="border-t border-line px-3 py-4 first:border-t-0 sm:px-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <CreditCard aria-hidden="true" className={cx('mt-1 size-5 shrink-0', closed ? 'text-muted' : 'text-plan')} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-lg font-semibold">{plan.name}</h3>
              <span
                className={cx(
                  'rounded-full border px-2 text-xs font-semibold',
                  closed ? 'border-line-strong text-muted' : 'border-plan text-plan',
                )}
              >
                {closed ? t('plans.closed') : t('plans.active')}
              </span>
            </div>
            <p className="text-sm text-muted">
              {plan.categoryName} · {t('plans.firstInstallment', { month: monthLong(plan.firstMonthKey, language) })}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-start gap-1">
          <div className="text-right">
            <p className="font-semibold">
              <Money bani={plan.installmentBani} tone="expense" />{' '}
              <span className="text-sm font-normal text-muted">{t('plans.perMonth')}</span>
            </p>
            <p className="text-sm text-muted">
              {t('plans.total')}: <Money bani={plan.totalBani} />
            </p>
          </div>
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={panelId}
            aria-label={toggleLabel}
            title={toggleLabel}
            onClick={() => { setExpanded((open) => !open) }}
            className="grid size-11 pointer-fine:size-9 place-items-center rounded-lg text-muted hover:bg-hover hover:text-ink [&_svg]:size-5"
          >
            {expanded ? <ChevronUp /> : <ChevronDown />}
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-1.5">
        <div className="flex justify-between gap-3 text-sm">
          <span className="text-muted">
            {t('plans.paid')}:{' '}
            <span className="font-semibold text-ink tabular-nums">
              {t('plans.paidOf', { paid: plan.paidInstallments, total: plan.installmentCount })}
            </span>
          </span>
          {!closed && plan.remainingInstallments > 0 && (
            <span className="text-muted tabular-nums">{t('plans.remaining', { count: plan.remainingInstallments })}</span>
          )}
        </div>
        <ProgressBar
          value={plan.paidInstallments}
          max={plan.installmentCount}
          label={t('plans.paid')}
          tone={closed ? 'brand' : 'gold'}
        />
      </div>

      <div className="mt-3 flex flex-col gap-1 text-sm text-muted">
        <p>{t('plans.addedOn', { date: dayLong(plan.createdAt, language) })}</p>
        {plan.purchaseDate && <p>{t('plans.purchaseDateValue', { date: dayLong(plan.purchaseDate, language) })}</p>}
      </div>

      {expanded && (
        <div id={panelId}>
          <Installments planId={plan.id} />
        </div>
      )}
    </li>
  )
}

// The plan's instalments, loaded when the row opens.
function Installments({ planId }: { planId: string }) {
  const { t, language } = useI18n()
  const [detail, setDetail] = useState<PlanDetail | null>(null)
  const [failure, setFailure] = useState<unknown>(null)
  const thisMonth = currentMonthKey()

  useEffect(() => {
    const controller = new AbortController()
    plansApi
      .get(planId, controller.signal)
      .then(setDetail)
      .catch((error: unknown) => { if (!controller.signal.aborted) setFailure(error) })
    return () => { controller.abort() }
  }, [planId])

  if (failure !== null) {
    return (
      <div className="mt-3">
        <Notice tone="error">
          {t('plans.installmentsFailed')} {errorText(failure, t)}
        </Notice>
      </div>
    )
  }
  if (!detail) {
    return (
      <div className="mt-3 flex flex-col gap-2" aria-busy="true" aria-label={t('common.loading')}>
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-2/3" />
      </div>
    )
  }
  return (
    <section className="mt-3 border-t border-line pt-3">
      <h4 className="mb-1 text-sm font-semibold">{t('plans.installments')}</h4>
      {detail.installments.length === 0 ? (
        <p className="text-sm text-muted">{t('plans.noInstallments')}</p>
      ) : (
        <ol>
          {detail.installments.map((installment) => {
            const current = installment.monthKey === thisMonth
            return (
              <li key={installment.id} className="flex min-h-9 items-center justify-between gap-3 text-sm">
                <span className="flex items-center gap-2">
                  <span
                    className={cx(
                      'grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold tabular-nums',
                      installment.paid ? 'bg-track text-income' : current ? 'border border-plan text-plan' : 'bg-track text-muted',
                    )}
                  >
                    {installment.paid ? (
                      <>
                        <Check aria-hidden="true" className="size-3.5" />
                        <span className="sr-only">{t('plans.installmentPaid')}</span>
                      </>
                    ) : (
                      installment.index
                    )}
                  </span>
                  <span className={cx(installment.paid && 'text-muted line-through', current && 'font-semibold')}>
                    {monthLong(installment.monthKey, language)}
                    {current && <span className="ml-1 text-xs font-normal text-plan">({t('plans.currentMonth')})</span>}
                  </span>
                </span>
                <Money bani={installment.amountBani} tone={installment.paid ? 'muted' : 'expense'} />
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
