import { CalendarPlus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ApiError, errorText } from '../../lib/api.ts'
import { useI18n } from '../../lib/i18n.tsx'
import { Button } from '../../ui/Button.tsx'
import { EmptyState } from '../../ui/EmptyState.tsx'
import { Notice } from '../../ui/Notice.tsx'
import { Skeleton } from '../../ui/Skeleton.tsx'
import { budgetApi, type Month } from './budget-api.ts'
import { monthName } from './month-key.ts'
import { MonthSummary } from './MonthSummary.tsx'

/* One month: an offer to create its budget when it has none, otherwise its
   totals. After a change the month is read again from the server, so what is
   shown is what is stored. */

type State =
  | { kind: 'loading' }
  | { kind: 'none'; creating: boolean; error: unknown }
  | { kind: 'failed'; error: unknown }
  | { kind: 'ready'; month: Month }

interface MonthViewProps {
  monthKey: string
  /** Called when the month's budget is created or deleted. */
  onHasBudget: (has: boolean) => void
}

export function MonthView({ monthKey, onHasBudget }: MonthViewProps) {
  const { t, language } = useI18n()
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    budgetApi
      .month(monthKey, controller.signal)
      .then((month) => { setState({ kind: 'ready', month }) })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        if (error instanceof ApiError && error.code === 'month_not_found') {
          setState({ kind: 'none', creating: false, error: null })
        } else {
          setState({ kind: 'failed', error })
        }
      })
    return () => { controller.abort() }
  }, [monthKey, attempt])

  const create = async () => {
    setState({ kind: 'none', creating: true, error: null })
    try {
      setState({ kind: 'ready', month: await budgetApi.createMonth(monthKey) })
      onHasBudget(true)
    } catch (error) {
      setState({ kind: 'none', creating: false, error })
    }
  }

  const name = monthName(monthKey, language)

  if (state.kind === 'loading') {
    return (
      <div role="status" className="space-y-3">
        <span className="sr-only">{t('common.loading')}</span>
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (state.kind === 'failed') {
    return (
      <div className="flex flex-col items-start gap-2">
        <Notice tone="error">
          {t('budget.loadFailed')} {errorText(state.error, t)}
        </Notice>
        <Button variant="quiet" onClick={() => { setState({ kind: 'loading' }); setAttempt((n) => n + 1) }}>
          {t('budget.tryAgain')}
        </Button>
      </div>
    )
  }

  if (state.kind === 'none') {
    return (
      <EmptyState
        icon={<CalendarPlus />}
        title={t('budget.noBudgetTitle', { month: name })}
        action={
          <Button disabled={state.creating} onClick={() => void create()}>
            {state.creating ? t('budget.creating') : t('budget.createMonth')}
          </Button>
        }
      >
        <p>{t('budget.noBudgetText')}</p>
        {state.error !== null && (
          <div className="mt-4 text-left">
            <Notice tone="error">{errorText(state.error, t)}</Notice>
          </div>
        )}
      </EmptyState>
    )
  }

  return (
    <section aria-label={name} className="space-y-4">
      <h2 className="text-lg font-semibold">{name}</h2>
      <MonthSummary totals={state.month.totals} />
    </section>
  )
}
