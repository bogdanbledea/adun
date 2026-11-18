import { useCallback, useEffect, useState } from 'react'
import { api, errorText } from '../../lib/api.ts'
import { isMessageKey, useI18n, type Language, type Translate } from '../../lib/i18n.tsx'
import { Button } from '../../ui/Button.tsx'
import { Notice } from '../../ui/Notice.tsx'
import { Skeleton } from '../../ui/Skeleton.tsx'
import { SettingsSection } from './SettingsSection.tsx'

/* The newest 50 entries, with "show more" for older pages, and a way to erase
   them all. An action this version has no text for shows its raw name. */

const PAGE = 50

interface ActivityEntry {
  id: number
  action: string
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
            {state.entries.map((entry) => (
              <li key={entry.id} className="flex items-baseline justify-between gap-3 border-t border-line py-2.5 first:border-t-0">
                <span className="min-w-0">{labelOf(entry.action, t)}</span>
                <time dateTime={entry.createdAt} className="shrink-0 text-right text-xs text-muted">
                  {formatInstant(entry.createdAt, language)}
                </time>
              </li>
            ))}
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
