import { Check, ChevronDown, ChevronUp, CreditCard, Pencil, Trash2 } from 'lucide-react'
import { useEffect, useId, useState, type SubmitEvent } from 'react'
import { errorText } from '../../lib/api.ts'
import { useI18n } from '../../lib/i18n.tsx'
import { Button } from '../../ui/Button.tsx'
import { cx } from '../../ui/cx.ts'
import { Field } from '../../ui/Field.tsx'
import { Money } from '../../ui/Money.tsx'
import { Notice } from '../../ui/Notice.tsx'
import { ProgressBar } from '../../ui/ProgressBar.tsx'
import { Skeleton } from '../../ui/Skeleton.tsx'
import { currentMonthKey, dayLong, monthLong } from '../budget/month-key.ts'
import { plansApi, type Plan, type PlanDetail } from './plans-api.ts'

/* One plan in the list: name and status, the monthly and total amounts,
   progress, when it was added, the purchase date (editable in place), and
   Close or Delete permanently. Expanding loads its instalments. */

interface PlanRowProps {
  plan: Plan
  onChanged: (plan: Plan) => void
  onClose: (plan: Plan) => void
  onDelete: (plan: Plan) => void
}

export function PlanRow({ plan, onChanged, onClose, onDelete }: PlanRowProps) {
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
        <PurchaseDate plan={plan} onChanged={onChanged} />
      </div>

      {expanded && (
        <div id={panelId}>
          <Installments planId={plan.id} />
        </div>
      )}

      <div className="mt-3 flex justify-end">
        <Button
          variant="quiet"
          className="min-h-9 px-3 py-1.5 text-danger! hover:text-danger!"
          onClick={() => { if (closed) onDelete(plan); else onClose(plan) }}
        >
          <Trash2 />
          {closed ? t('plans.deletePermanently') : t('plans.close')}
        </Button>
      </div>
    </li>
  )
}

// The purchase date as text with an edit button, or a small form while editing.
function PurchaseDate({ plan, onChanged }: { plan: Plan; onChanged: (plan: Plan) => void }) {
  const { t, language } = useI18n()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState<unknown>(null)

  const start = () => {
    setValue(plan.purchaseDate ?? '')
    setFailure(null)
    setEditing(true)
  }
  const save = async (event: SubmitEvent) => {
    event.preventDefault()
    setSaving(true)
    try {
      onChanged(await plansApi.setPurchaseDate(plan.id, value || null))
      setEditing(false)
    } catch (error) {
      setFailure(error)
    }
    setSaving(false)
  }

  if (editing) {
    return (
      <form onSubmit={(event) => void save(event)} className="mt-1 flex flex-col gap-2">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-48 flex-1">
            <Field
              type="date"
              label={t('plans.purchaseDate')}
              value={value}
              autoFocus
              onChange={(event) => { setValue(event.target.value) }}
            />
          </div>
          <Button variant="quiet" onClick={() => { setEditing(false) }}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? t('common.saving') : t('common.save')}
          </Button>
        </div>
        {failure !== null && (
          <Notice tone="error">
            {t('plans.purchaseDateFailed')} {errorText(failure, t)}
          </Notice>
        )}
      </form>
    )
  }
  if (!plan.purchaseDate) {
    return (
      <button type="button" onClick={start} className="w-fit py-1 text-left text-brand hover:underline">
        + {t('plans.addPurchaseDate')}
      </button>
    )
  }
  return (
    <p className="flex items-center gap-1">
      {t('plans.purchaseDateValue', { date: dayLong(plan.purchaseDate, language) })}
      <button
        type="button"
        onClick={start}
        aria-label={t('plans.editPurchaseDate', { name: plan.name })}
        title={t('plans.editPurchaseDate', { name: plan.name })}
        className="grid size-8 place-items-center rounded-lg hover:bg-hover hover:text-ink [&_svg]:size-3.5"
      >
        <Pencil />
      </button>
    </p>
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
