import { Copy, FileText, LayoutTemplate } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate, useParams } from 'react-router'
import { errorText } from '../../lib/api.ts'
import { useI18n } from '../../lib/i18n.tsx'
import { Button } from '../../ui/Button.tsx'
import { EmptyState } from '../../ui/EmptyState.tsx'
import { Notice } from '../../ui/Notice.tsx'
import { budgetApi, type Source } from './budget-api.ts'
import { currentMonthKey, monthKeyToParam, monthLong, monthRange, paramToMonthKey, shiftMonth } from './month-key.ts'
import { MonthSkeleton } from './MonthSkeleton.tsx'
import { MonthStrip } from './MonthStrip.tsx'
import { MonthView } from './MonthView.tsx'

/* /buget/:month (MM-YY). The strip offers 12 months back and 13 ahead; a URL
   outside that window, or not a month, opens the current one. The list of
   months with a budget decides whether a month shows its budget or offers
   to create one: empty, from the template, or as a copy of the month before
   when they have something to copy. */

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

// Whether the template has entries to copy. A failure only hides the template choices.
function useHasTemplate(): boolean {
  const [hasTemplate, setHasTemplate] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    budgetApi
      .template(controller.signal)
      .then((template) => { setHasTemplate(template.categories.length > 0) })
      .catch(() => { setHasTemplate(false) })
    return () => { controller.abort() }
  }, [])
  return hasTemplate
}

export function BudgetPage() {
  const { t } = useI18n()
  const { month } = useParams()
  const today = currentMonthKey()
  const visible = useMemo(() => monthRange(today, MONTHS_BACK, MONTHS_AHEAD), [today])
  const selected = month ? paramToMonthKey(month) : null
  const { months, error, reload, add, remove } = useMonths()
  const hasTemplate = useHasTemplate()

  if (!selected || !visible.includes(selected)) return <Navigate to={`/buget/${monthKeyToParam(today)}`} replace />

  const previous = shiftMonth(selected, -1)
  const previousWithBudget = months?.has(previous) ? previous : null

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
          previousMonth={previousWithBudget}
          hasTemplate={hasTemplate}
          onMonthCreated={add}
          onMonthDeleted={remove}
        />
      ) : (
        <NewMonth
          key={selected}
          monthKey={selected}
          previousMonth={previousWithBudget}
          hasTemplate={hasTemplate}
          onCreated={add}
        />
      )}
    </>
  )
}

interface NewMonthProps {
  monthKey: string
  /** The month before, when it has a budget to copy. */
  previousMonth: string | null
  hasTemplate: boolean
  onCreated: (monthKey: string) => void
}

function NewMonth({ monthKey, previousMonth, hasTemplate, onCreated }: NewMonthProps) {
  const { t, language } = useI18n()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const hasChoices = hasTemplate || previousMonth !== null

  const create = async (from?: Source) => {
    setBusy(true)
    setError(null)
    try {
      await budgetApi.createMonth(monthKey, from)
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
          <>
            {hasTemplate && (
              <Button onClick={() => void create('template')}>
                <LayoutTemplate />
                {t('budget.useTemplate')}
              </Button>
            )}
            {previousMonth && (
              <Button variant={hasTemplate ? 'secondary' : 'primary'} onClick={() => void create(previousMonth)}>
                <Copy />
                {t('budget.copyMonth', { month: monthLong(previousMonth, language) })}
              </Button>
            )}
            <Button variant={hasChoices ? 'quiet' : 'primary'} onClick={() => void create()}>
              {t('budget.createEmpty')}
            </Button>
          </>
        )
      }
    >
      <p className="mb-2 text-xs font-semibold tracking-[0.14em] text-brand uppercase">{t('budget.newSheet')}</p>
      <p>{hasChoices ? t('budget.newSheetChoices') : t('budget.newSheetText')}</p>
      {hasChoices && <p className="mt-2 text-sm">{t('budget.copyHint')}</p>}
      {error !== null && (
        <div className="mt-4 text-left">
          <Notice tone="error">{errorText(error, t)}</Notice>
        </div>
      )}
    </EmptyState>
  )
}
