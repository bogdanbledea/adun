import { CalendarPlus, EllipsisVertical, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ApiError, errorText } from '../../lib/api.ts'
import { useI18n } from '../../lib/i18n.tsx'
import { Button } from '../../ui/Button.tsx'
import { EmptyState } from '../../ui/EmptyState.tsx'
import { Menu } from '../../ui/Menu.tsx'
import { Notice } from '../../ui/Notice.tsx'
import { Skeleton } from '../../ui/Skeleton.tsx'
import { budgetApi, type Month } from './budget-api.ts'
import { CategoryList } from './CategoryList.tsx'
import { monthName } from './month-key.ts'
import { MonthSummary } from './MonthSummary.tsx'

/* One month: an offer to create its budget when it has none, otherwise its
   totals and its entries by category, with a menu to delete the month. After
   a change the month is read again from the server, so what is shown is what
   is stored. */

type State =
  | { kind: 'loading' }
  | { kind: 'none'; creating: boolean; error: unknown }
  | { kind: 'failed'; error: unknown }
  | { kind: 'ready'; month: Month }

type Deleting = { kind: 'idle' } | { kind: 'asking'; busy: boolean; error: unknown }

interface MonthViewProps {
  monthKey: string
  /** Called when the month's budget is created or deleted. */
  onHasBudget: (has: boolean) => void
}

export function MonthView({ monthKey, onHasBudget }: MonthViewProps) {
  const { t, language } = useI18n()
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [deleting, setDeleting] = useState<Deleting>({ kind: 'idle' })

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

  const deleteMonth = async () => {
    setDeleting({ kind: 'asking', busy: true, error: null })
    try {
      await budgetApi.deleteMonth(monthKey)
      setDeleting({ kind: 'idle' })
      setState({ kind: 'none', creating: false, error: null })
      onHasBudget(false)
    } catch (error) {
      setDeleting({ kind: 'asking', busy: false, error })
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

  const { month } = state

  return (
    <section aria-label={name} className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{name}</h2>
        <Menu
          label={t('budget.monthMenu')}
          trigger={<EllipsisVertical />}
          triggerClassName="grid size-11 place-items-center rounded-lg text-muted transition-colors duration-150 hover:bg-hover hover:text-ink pointer-fine:size-9 [&_svg]:size-[18px]"
          items={[
            {
              label: t('budget.deleteMonth'),
              icon: <Trash2 />,
              tone: 'danger',
              onSelect: () => { setDeleting({ kind: 'asking', busy: false, error: null }) },
            },
          ]}
        />
      </div>
      {deleting.kind === 'asking' && (
        <div className="card flex flex-col gap-3 px-4 py-3">
          <p className="text-sm">{t('budget.deleteMonthConfirm', { month: name })}</p>
          {deleting.error !== null && <Notice tone="error">{errorText(deleting.error, t)}</Notice>}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="quiet" disabled={deleting.busy} onClick={() => { setDeleting({ kind: 'idle' }) }}>
              {t('budget.cancel')}
            </Button>
            <Button variant="danger" disabled={deleting.busy} onClick={() => void deleteMonth()}>
              {t('budget.deleteMonthYes')}
            </Button>
          </div>
        </div>
      )}
      <MonthSummary totals={month.totals} />
      {month.categories.length > 0 ? (
        <CategoryList categories={month.categories} />
      ) : (
        <p className="card px-4 py-8 text-center text-sm text-muted">{t('budget.noEntries')}</p>
      )}
    </section>
  )
}
