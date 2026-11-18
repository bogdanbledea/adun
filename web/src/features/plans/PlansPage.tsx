import { CreditCard } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { PageHeader } from '../../layout/PageHeader.tsx'
import { errorText } from '../../lib/api.ts'
import { useT } from '../../lib/i18n.tsx'
import { Button } from '../../ui/Button.tsx'
import { EmptyState } from '../../ui/EmptyState.tsx'
import { Notice } from '../../ui/Notice.tsx'
import { Skeleton } from '../../ui/Skeleton.tsx'
import { PlanRow } from './PlanRow.tsx'
import { plansApi, type Plan } from './plans-api.ts'

/* /planuri-de-rate: the user's payment plans, newest first, each with how
   many instalments are paid and, on request, the months they fall in. */

export function PlansPage() {
  const t = useT()
  const [plans, setPlans] = useState<Plan[] | null>(null)
  const [loadError, setLoadError] = useState<unknown>(null)

  const load = useCallback(
    (signal?: AbortSignal) =>
      plansApi
        .list(signal)
        .then((list) => {
          setPlans(list)
          setLoadError(null)
        })
        .catch((error: unknown) => {
          if (!signal?.aborted) setLoadError(error)
        }),
    [],
  )

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => { controller.abort() }
  }, [load])

  let body
  if (loadError !== null && !plans) {
    body = (
      <>
        <Notice tone="error">
          {t('plans.loadFailed')} {errorText(loadError, t)}
        </Notice>
        <Button variant="quiet" className="mt-2" onClick={() => void load()}>
          {t('common.tryAgain')}
        </Button>
      </>
    )
  } else if (!plans) {
    body = (
      <div aria-busy="true" aria-label={t('common.loading')} className="flex flex-col gap-px card">
        {[0, 1].map((i) => (
          <div key={i} className="flex flex-col gap-3 px-4 py-5">
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-2 w-full" />
          </div>
        ))}
      </div>
    )
  } else if (plans.length === 0) {
    body = (
      <EmptyState icon={<CreditCard />} title={t('plans.empty')}>
        {t('plans.emptyText')}
      </EmptyState>
    )
  } else {
    body = (
      <section aria-labelledby="plans-list" className="card">
        <h2 id="plans-list" className="sr-only">
          {t('plans.list')}
        </h2>
        <ul>
          {plans.map((plan) => (
            <PlanRow key={plan.id} plan={plan} />
          ))}
        </ul>
      </section>
    )
  }

  return (
    <>
      <PageHeader title={t('plans.title')} subtitle={t('plans.subtitle')} />
      {body}
    </>
  )
}
