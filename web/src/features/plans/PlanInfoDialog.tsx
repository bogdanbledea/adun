import { CreditCard, Pencil } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { errorText } from '../../lib/api.ts'
import { useI18n } from '../../lib/i18n.tsx'
import { Button } from '../../ui/Button.tsx'
import { Dialog } from '../../ui/Dialog.tsx'
import { Money } from '../../ui/Money.tsx'
import { Notice } from '../../ui/Notice.tsx'
import { ProgressBar } from '../../ui/ProgressBar.tsx'
import { Skeleton } from '../../ui/Skeleton.tsx'
import { monthLong } from '../budget/month-key.ts'
import { plansApi, type PlanDetail } from './plans-api.ts'

/* Opened from an instalment in a month: the plan it belongs to, with its
   amounts and progress, a way to edit this instalment, and a link to all
   plans. */

interface PlanInfoDialogProps {
  planId: string
  onClose: () => void
  onEditInstallment: () => void
}

export function PlanInfoDialog({ planId, onClose, onEditInstallment }: PlanInfoDialogProps) {
  const { t, language } = useI18n()
  const navigate = useNavigate()
  const [plan, setPlan] = useState<PlanDetail | null>(null)
  const [failure, setFailure] = useState<unknown>(null)

  useEffect(() => {
    const controller = new AbortController()
    plansApi
      .get(planId, controller.signal)
      .then(setPlan)
      .catch((error: unknown) => { if (!controller.signal.aborted) setFailure(error) })
    return () => { controller.abort() }
  }, [planId])

  return (
    <Dialog
      open
      onClose={onClose}
      title={t('plans.infoTitle')}
      footer={
        <>
          <Button variant="quiet" onClick={onEditInstallment}>
            <Pencil />
            {t('plans.editInstallment')}
          </Button>
          <Button onClick={() => { void navigate('/planuri-de-rate') }}>
            <CreditCard />
            {t('plans.allPlans')}
          </Button>
        </>
      }
    >
      {failure !== null ? (
        <Notice tone="error">{errorText(failure, t)}</Notice>
      ) : !plan ? (
        <div aria-busy="true" aria-label={t('common.loading')} className="flex flex-col gap-3">
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-2 w-full" />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="-mt-1 text-sm text-muted">
            {plan.name} · {plan.categoryName}
          </p>
          <dl className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-hover p-3">
              <dt className="text-sm text-muted">{t('plans.monthly')}</dt>
              <dd className="font-display text-xl font-semibold">
                <Money bani={plan.installmentBani} />
              </dd>
            </div>
            <div className="rounded-lg bg-hover p-3">
              <dt className="text-sm text-muted">{t('plans.totalValue')}</dt>
              <dd className="font-display text-xl font-semibold">
                <Money bani={plan.totalBani} />
              </dd>
            </div>
          </dl>
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-muted">{t('plans.paid')}</span>
              <span className="font-semibold tabular-nums">
                {t('plans.paidOf', { paid: plan.paidInstallments, total: plan.installmentCount })}
              </span>
            </div>
            <ProgressBar
              value={plan.paidInstallments}
              max={plan.installmentCount}
              label={t('plans.paid')}
              tone={plan.closedAt ? 'brand' : 'gold'}
            />
            <div className="flex justify-between gap-3 text-sm text-muted">
              <span>{t('plans.firstInstallment', { month: monthLong(plan.firstMonthKey, language) })}</span>
              <span>{plan.closedAt ? t('plans.closed') : t('plans.remaining', { count: plan.remainingInstallments })}</span>
            </div>
          </div>
        </div>
      )}
    </Dialog>
  )
}
