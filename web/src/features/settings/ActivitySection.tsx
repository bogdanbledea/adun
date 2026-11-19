import { Fragment, useCallback, useEffect, useState } from 'react'
import { api, errorText } from '../../lib/api.ts'
import { isMessageKey, useI18n, type Language, type Translate } from '../../lib/i18n.tsx'
import { Button } from '../../ui/Button.tsx'
import { Money } from '../../ui/Money.tsx'
import { Notice } from '../../ui/Notice.tsx'
import { Skeleton } from '../../ui/Skeleton.tsx'
import { dayLong, monthLong } from '../budget/month-key.ts'
import { paydayText } from '../food/food-format.ts'
import { SettingsSection } from './SettingsSection.tsx'

/* The newest 50 entries, with "show more" for older pages, and a way to erase
   them all. An action this version has no text for shows its raw name. A
   budget, reminder, food or calendar action also shows what it was about,
   from the entry's details. */

const PAGE = 50

interface ActivityEntry {
  id: number
  action: string
  metadata: Record<string, string | number | null> | null
  createdAt: string
}

type State =
  | { kind: 'loading' }
  | { kind: 'failed'; error: unknown }
  | { kind: 'ready'; entries: ActivityEntry[]; more: boolean; loadingMore: boolean; moreError: unknown }

function labelOf(action: string, t: Translate): string {
  const key = `activity.${action}`
  return isMessageKey(key) ? t(key) : action
}

/* A piece of the details line: text, or an amount, which goes through Money
   so it is hidden with the others. */
type Detail = string | { bani: number; income: boolean }

// Leaves out what the entry did not record (and stray numbers in metadata).
function present<T>(part: T | null | undefined): part is Extract<T, Detail> {
  if (typeof part === 'string') return part !== ''
  return typeof part === 'object' && part !== null
}

/** "Chirie · Casă · 1.500 lei · Noiembrie 2026" for an entry; for a month its name, and where its
    entries were copied from. A null monthKey is the template. */
function detailsOf({ action, metadata }: ActivityEntry, t: Translate, language: Language): Detail[] {
  if (!metadata) return []
  const month = (key: unknown) => (typeof key === 'string' ? monthLong(key, language) : key === null ? t('activity.template') : null)
  if (action.startsWith('month.')) {
    const { from, entries } = metadata
    const source = from === 'template' ? t('activity.template') : month(from)
    return [
      month(metadata.monthKey),
      source && t('activity.from', { source }),
      typeof entries === 'number' && from !== undefined ? t('activity.entries', { count: entries }) : null,
    ].filter(present)
  }
  if (action.startsWith('plan.')) {
    const { name, installments, totalBani, deletedInstallments } = metadata
    return [
      name,
      typeof totalBani === 'number' ? { bani: totalBani, income: false } : null,
      typeof installments === 'number' ? t('activity.installments', { count: installments }) : null,
      month(metadata.firstMonthKey),
      typeof deletedInstallments === 'number' ? t('activity.installments', { count: deletedInstallments }) : null,
    ].filter(present)
  }
  if (action.startsWith('reminder.')) {
    const { name, kind, dueDate, from, to } = metadata
    const day = (date: unknown) => (typeof date === 'string' ? dayLong(date, language) : null)
    const kindKey = `reminders.kind.${String(kind)}`
    return [
      name,
      isMessageKey(kindKey) ? t(kindKey) : null,
      day(dueDate),
      from && to ? `${day(from) ?? ''} → ${day(to) ?? ''}` : null,
    ].filter(present)
  }
  if (action.startsWith('food.')) {
    const { merchant, amountBani, totalBani, sources, deleted, rule, paydayWorkingDay } = metadata
    if (action === 'food.period_rule_set') {
      return rule === 'working_day' && typeof paydayWorkingDay === 'number'
        ? [t('foodPeriod.payday'), paydayText(t, language, paydayWorkingDay)]
        : [t('foodPeriod.calendar')]
    }
    return [
      merchant,
      typeof amountBani === 'number' ? { bani: amountBani, income: false } : null,
      typeof totalBani === 'number' ? { bani: totalBani, income: false } : null,
      typeof sources === 'number' ? t('activity.sources', { count: sources }) : null,
      typeof deleted === 'number' ? t('activity.purchases', { count: deleted }) : null,
      month(metadata.monthKey),
    ].filter(present)
  }
  if (action.startsWith('calendar.')) {
    const { date, kind } = metadata
    return [
      typeof date === 'string' ? dayLong(date, language) : null,
      kind === 'off' ? t('calendar.dayOff') : kind === 'working' ? t('calendar.workingDay') : null,
    ].filter(present)
  }
  if (!action.startsWith('entry.')) return []
  const { description, category, type, amountBani } = metadata
  const amount = typeof amountBani === 'number' ? { bani: amountBani, income: type === 'income' } : null
  const where =
    action === 'entry.moved' ? `${month(metadata.fromMonthKey) ?? ''} → ${month(metadata.monthKey) ?? ''}` : month(metadata.monthKey)
  return [description, category, amount, where].filter(present)
}

/** "18 nov. 2026, 14:05", in the browser's time zone. */
function formatInstant(iso: string, language: Language): string {
  return new Intl.DateTimeFormat(language === 'ro' ? 'ro-RO' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(iso),
  )
}

export function ActivitySection() {
  const { t, language } = useI18n()
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [erase, setErase] = useState<{ asking: boolean; busy: boolean; error: unknown }>({ asking: false, busy: false, error: null })

  // The first page; replaces whatever is shown when it arrives.
  const fetchFirst = useCallback((signal?: AbortSignal) => {
    api<ActivityEntry[]>(`/api/activity?limit=${String(PAGE)}`, { signal })
      .then((entries) => {
        setState({ kind: 'ready', entries, more: entries.length === PAGE, loadingMore: false, moreError: null })
      })
      .catch((error: unknown) => {
        if (!signal?.aborted) setState({ kind: 'failed', error })
      })
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    fetchFirst(controller.signal)
    return () => { controller.abort() }
  }, [fetchFirst])

  const retry = () => {
    setState({ kind: 'loading' })
    fetchFirst()
  }

  const loadMore = async () => {
    if (state.kind !== 'ready') return
    const { entries } = state
    setState({ ...state, loadingMore: true, moreError: null })
    try {
      const older = await api<ActivityEntry[]>(`/api/activity?limit=${String(PAGE)}&offset=${String(entries.length)}`)
      setState({ kind: 'ready', entries: [...entries, ...older], more: older.length === PAGE, loadingMore: false, moreError: null })
    } catch (error) {
      setState({ kind: 'ready', entries, more: true, loadingMore: false, moreError: error })
    }
  }

  const eraseAll = async () => {
    setErase({ asking: true, busy: true, error: null })
    try {
      await api('/api/activity', { method: 'DELETE' })
      setErase({ asking: false, busy: false, error: null })
      setState({ kind: 'ready', entries: [], more: false, loadingMore: false, moreError: null })
    } catch (error) {
      setErase({ asking: true, busy: false, error })
    }
  }

  const hasEntries = state.kind === 'ready' && state.entries.length > 0

  return (
    <SettingsSection title={t('settings.activity')}>
      <p className="mb-3 text-sm text-muted">{t('settings.activityText')}</p>
      {state.kind === 'loading' && (
        <div role="status" className="space-y-3 py-2">
          <span className="sr-only">{t('common.loading')}</span>
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      )}
      {state.kind === 'failed' && (
        <div className="flex flex-col items-start gap-2">
          <Notice tone="error">{errorText(state.error, t)}</Notice>
          <Button variant="quiet" onClick={retry}>
            {t('settings.tryAgain')}
          </Button>
        </div>
      )}
      {state.kind === 'ready' && state.entries.length === 0 && (
        <p className="py-4 text-center text-sm text-muted">{t('settings.noActivity')}</p>
      )}
      {hasEntries && (
        <>
          <ul>
            {state.entries.map((entry) => {
              const details = detailsOf(entry, t, language)
              return (
                <li key={entry.id} className="flex items-baseline justify-between gap-3 border-t border-line py-2.5 first:border-t-0">
                  <span className="min-w-0">
                    {labelOf(entry.action, t)}
                    {details.length > 0 && (
                      <span className="block text-sm break-words text-muted">
                        {details.map((part, index) => (
                          <Fragment key={index}>
                            {index > 0 && ' · '}
                            {typeof part === 'string' ? part : <>{part.income && '+'}<Money bani={part.bani} /></>}
                          </Fragment>
                        ))}
                      </span>
                    )}
                  </span>
                  <time dateTime={entry.createdAt} className="shrink-0 text-right text-xs text-muted">
                    {formatInstant(entry.createdAt, language)}
                  </time>
                </li>
              )
            })}
          </ul>
          {state.moreError !== null && <Notice tone="error">{errorText(state.moreError, t)}</Notice>}
          {state.more && (
            <div className="flex justify-center border-t border-line pt-3">
              <Button variant="quiet" disabled={state.loadingMore} onClick={() => void loadMore()}>
                {state.loadingMore ? t('common.loading') : t('settings.showMore')}
              </Button>
            </div>
          )}
          <div className="mt-4 flex flex-col gap-3 border-t border-line pt-4">
            {erase.asking ? (
              <>
                <p className="text-sm">{t('settings.eraseActivityConfirm')}</p>
                {erase.error !== null && <Notice tone="error">{errorText(erase.error, t)}</Notice>}
                <div className="flex flex-wrap justify-end gap-2">
                  <Button variant="quiet" disabled={erase.busy} onClick={() => { setErase({ asking: false, busy: false, error: null }) }}>
                    {t('settings.cancel')}
                  </Button>
                  <Button variant="danger" disabled={erase.busy} onClick={() => void eraseAll()}>
                    {t('settings.eraseActivityYes')}
                  </Button>
                </div>
              </>
            ) : (
              <div>
                <Button variant="secondary" onClick={() => { setErase({ asking: true, busy: false, error: null }) }}>
                  {t('settings.eraseActivity')}
                </Button>
              </div>
            )}
          </div>
        </>
      )}
    </SettingsSection>
  )
}
