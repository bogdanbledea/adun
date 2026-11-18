import { FileText } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate, useParams } from 'react-router'
import { errorText } from '../../lib/api.ts'
import { useI18n } from '../../lib/i18n.tsx'
import { Button } from '../../ui/Button.tsx'
import { EmptyState } from '../../ui/EmptyState.tsx'
import { Notice } from '../../ui/Notice.tsx'
import { budgetApi } from './budget-api.ts'
import { currentMonthKey, monthKeyToParam, monthLong, monthRange, paramToMonthKey } from './month-key.ts'
import { MonthSkeleton } from './MonthSkeleton.tsx'
import { MonthStrip } from './MonthStrip.tsx'
import { MonthView } from './MonthView.tsx'

/* /buget/:month (MM-YY). The strip offers 12 months back and 13 ahead; a URL
   outside that window, or not a month, opens the current one. The list of
   months with a budget decides whether a month shows its budget or offers
   to create one. */

const MONTHS_BACK = 12
const MONTHS_AHEAD = 13

interface MonthsState {
  months: Set<string> | null
  error: unknown
  reload: () => void
  add: (monthKey: string) => void
  remove: (monthKey: string) => void
}

function useMonths(): MonthsState {
  const [months, setMonths] = useState<Set<string> | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    budgetApi
      .months(controller.signal)
      .then((keys) => {
        setMonths(new Set(keys))
        setError(null)
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setError(err)
      })
    return () => { controller.abort() }
  }, [attempt])

  return {
    months,
    error,
    reload: useCallback(() => {
      setError(null)
      setAttempt((n) => n + 1)
    }, []),
    add: useCallback((monthKey: string) => { setMonths((prev) => new Set(prev).add(monthKey)) }, []),
    remove: useCallback((monthKey: string) => {
      setMonths((prev) => {
        const next = new Set(prev)
        next.delete(monthKey)
        return next
      })
    }, []),
  }
}

export function BudgetPage() {
  const { t } = useI18n()
  const { month } = useParams()
  const today = currentMonthKey()
  const visible = useMemo(() => monthRange(today, MONTHS_BACK, MONTHS_AHEAD), [today])
  const selected = month ? paramToMonthKey(month) : null
  const { months, error, reload, add, remove } = useMonths()

  if (!selected || !visible.includes(selected)) return <Navigate to={`/buget/${monthKeyToParam(today)}`} replace />

  return (
    <>
      <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
        <h1 className="shrink-0 text-2xl font-semibold tracking-tight">{t('budget.title')}</h1>
        <MonthStrip months={visible} selected={selected} withBudget={months ?? new Set()} currentYear={today.slice(0, 4)} />
      </header>

      {error ? (
        <div className="flex flex-col items-start gap-2">
          <Notice tone="error">
            {t('budget.loadFailed')} {errorText(error, t)}
          </Notice>
          <Button variant="quiet" onClick={reload}>
            {t('common.tryAgain')}
          </Button>
        </div>
      ) : !months ? (
        <MonthSkeleton />
      ) : months.has(selected) ? (
        <MonthView
          key={selected}
          monthKey={selected}
          months={visible}
          monthsWithBudget={months}
          onMonthCreated={add}
          onMonthDeleted={remove}
        />
      ) : (
        <NewMonth key={selected} monthKey={selected} onCreated={add} />
      )}
    </>
  )
}

function NewMonth({ monthKey, onCreated }: { monthKey: string; onCreated: (monthKey: string) => void }) {
  const { t, language } = useI18n()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  const create = async () => {
    setBusy(true)
    setError(null)
    try {
      await budgetApi.createMonth(monthKey)
      onCreated(monthKey)
    } catch (err) {
      setError(err)
      setBusy(false)
    }
  }

  return (
    <EmptyState
      icon={<FileText />}
      title={t('budget.noBudget', { month: monthLong(monthKey, language) })}
      action={
        busy ? (
          <p role="status" className="text-muted">
            {t('budget.creating')}
          </p>
        ) : (
          <Button onClick={() => void create()}>{t('budget.createEmpty')}</Button>
        )
      }
    >
      <p className="mb-2 text-xs font-semibold tracking-[0.14em] text-brand uppercase">{t('budget.newSheet')}</p>
      <p>{t('budget.newSheetText')}</p>
      {error !== null && (
        <div className="mt-4 text-left">
          <Notice tone="error">{errorText(error, t)}</Notice>
        </div>
      )}
    </EmptyState>
  )
}
