import { CreditCard, Plus } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { PageHeader } from '../../layout/PageHeader.tsx'
import { errorText } from '../../lib/api.ts'
import { useT } from '../../lib/i18n.tsx'
import { Button } from '../../ui/Button.tsx'
import { ConfirmDialog } from '../../ui/Dialog.tsx'
import { EmptyState } from '../../ui/EmptyState.tsx'
import { Notice } from '../../ui/Notice.tsx'
import { Skeleton } from '../../ui/Skeleton.tsx'
import { CreatePlanDialog } from './CreatePlanDialog.tsx'
import { PlanRow } from './PlanRow.tsx'
import { plansApi, type Plan } from './plans-api.ts'

/* /planuri-de-rate: the user's payment plans, newest first, each with how
   many instalments are paid and, on request, the months they fall in.
   Creating a plan fills the months it covers; closing one deletes the
   instalments still to come; a closed plan can be deleted for good with all
   its instalments. After each of these the list is read again. */

type Confirm = { action: 'close' | 'delete'; plan: Plan } | null

export function PlansPage() {
  const t = useT()
  const [plans, setPlans] = useState<Plan[] | null>(null)
  const [loadError, setLoadError] = useState<unknown>(null)
  const [creating, setCreating] = useState(false)
  const [confirm, setConfirm] = useState<Confirm>(null)
  const [failure, setFailure] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)

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

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true)
    setFailure(null)
    try {
      await action()
      await load()
    } catch (error) {
      setFailure(error)
    }
    setBusy(false)
    setConfirm(null)
  }

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
      <EmptyState
        icon={<CreditCard />}
        title={t('plans.empty')}
        action={
          <Button onClick={() => { setCreating(true) }}>
            <Plus />
            {t('plans.addFirst')}
          </Button>
        }
      >
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
            <PlanRow
              key={plan.id}
              plan={plan}
              onChanged={(changed) => { setPlans((list) => list?.map((p) => (p.id === changed.id ? changed : p)) ?? list) }}
              onClose={(target) => { setConfirm({ action: 'close', plan: target }) }}
              onDelete={(target) => { setConfirm({ action: 'delete', plan: target }) }}
            />
          ))}
        </ul>
      </section>
    )
  }

  return (
    <>
      <PageHeader
        title={t('plans.title')}
        subtitle={t('plans.subtitle')}
        // An empty page has its own button in the empty state.
        action={
          plans !== null &&
          plans.length > 0 && (
            <Button className="self-start sm:self-auto" onClick={() => { setCreating(true) }}>
              <Plus />
              {t('plans.add')}
            </Button>
          )
        }
      />
      {failure !== null && (
        <div className="mb-4">
          <Notice tone="error">
            {t('plans.actionFailed')} {errorText(failure, t)}
          </Notice>
        </div>
      )}
      {body}
      <ConfirmDialog
        open={confirm?.action === 'close'}
        title={confirm ? t('plans.closeTitle', { name: confirm.plan.name }) : ''}
        confirmLabel={t('plans.close')}
        destructive
        busy={busy}
        onConfirm={() => { if (confirm) void run(() => plansApi.close(confirm.plan.id)) }}
        onCancel={() => { setConfirm(null) }}
      >
        {confirm && t('plans.closeText', { count: confirm.plan.remainingInstallments })}
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm?.action === 'delete'}
        title={confirm ? t('plans.deleteTitle', { name: confirm.plan.name }) : ''}
        confirmLabel={t('plans.deletePermanently')}
        destructive
        busy={busy}
        onConfirm={() => { if (confirm) void run(() => plansApi.remove(confirm.plan.id)) }}
        onCancel={() => { setConfirm(null) }}
      >
        {t('plans.deleteText')}
      </ConfirmDialog>
      {creating && <CreatePlanDialog onClose={() => { setCreating(false) }} onCreated={() => void load()} />}
    </>
  )
}
