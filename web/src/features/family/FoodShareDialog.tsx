import { useCallback, useEffect, useState } from 'react'
import { errorText } from '../../lib/api.ts'
import { useI18n } from '../../lib/i18n.tsx'
import { Button } from '../../ui/Button.tsx'
import { Dialog } from '../../ui/Dialog.tsx'
import { Money } from '../../ui/Money.tsx'
import { Notice } from '../../ui/Notice.tsx'
import { Skeleton } from '../../ui/Skeleton.tsx'
import { monthLong } from '../budget/month-key.ts'
import { counted } from '../food/food-format.ts'
import { familyApi, type Resolution, type SharePreview, type ShareSummary } from './family-api.ts'

/* Sharing personal food months with the family. Months never merge: each one
   moves over whole or, when the family already has that month, waits for
   "keep mine" or "keep the family's". The same dialog settles the months
   that stop the last member from leaving. */

export function FoodShareDialog({ onClose }: { onClose: () => void }) {
  const { t, language } = useI18n()
  const [preview, setPreview] = useState<SharePreview | null>(null)
  const [loadError, setLoadError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [changed, setChanged] = useState(false)

  // Clears an earlier error only once an answer arrives.
  const load = useCallback((signal?: AbortSignal) => {
    familyApi
      .sharePreview(signal)
      .then((next) => {
        setPreview(next)
        setLoadError(null)
      })
      .catch((failure: unknown) => {
        if (!signal?.aborted) setLoadError(failure)
      })
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => { controller.abort() }
  }, [load])

  const act = async (action: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await action()
      setChanged(true)
      load()
    } catch (failure) {
      setError(failure)
    } finally {
      setBusy(false)
    }
  }

  const resolve = (monthKey: string, resolution: Resolution) => act(() => familyApi.resolve(monthKey, resolution))

  let body
  if (loadError !== null) {
    body = (
      <div className="flex flex-col items-start gap-2">
        <Notice tone="error">
          {t('share.loadFailed')} {errorText(loadError, t)}
        </Notice>
        <Button variant="quiet" onClick={() => { load() }}>
          {t('settings.tryAgain')}
        </Button>
      </div>
    )
  } else if (!preview) {
    body = (
      <div role="status" className="flex flex-col gap-2">
        <span className="sr-only">{t('common.loading')}</span>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-16 w-full" />
      </div>
    )
  } else if (preview.clean.length === 0 && preview.conflicts.length === 0) {
    body = <Notice tone={changed ? 'success' : 'info'}>{changed ? t('share.allDone') : t('share.nothing')}</Notice>
  } else {
    body = (
      <div className="flex flex-col gap-5">
        {preview.clean.length > 0 && (
          <section aria-labelledby="share-clean">
            <h3 id="share-clean" className="font-semibold">
              {t('share.cleanTitle')}
            </h3>
            <p className="mt-1 text-sm text-muted">{t('share.cleanText')}</p>
            <ul className="mt-2 divide-y divide-line border-y border-line">
              {preview.clean.map((month) => (
                <li key={month.monthKey} className="flex items-center justify-between gap-3 py-2">
                  <span>{monthLong(month.monthKey, language)}</span>
                  <Money bani={month.mine.totalBani} />
                </li>
              ))}
            </ul>
            <Button className="mt-3" onClick={() => void act(familyApi.share)} disabled={busy}>
              {t('share.shareClean')}
            </Button>
          </section>
        )}

        {preview.conflicts.length > 0 && (
          <section aria-labelledby="share-conflicts">
            <h3 id="share-conflicts" className="font-semibold">
              {t('share.conflictsTitle')}
            </h3>
            <p className="mt-1 text-sm text-muted">{t('share.conflictsText')}</p>
            <ul className="mt-2 flex flex-col gap-3">
              {preview.conflicts.map((month) => {
                const locked = month.family.purchaseCount > 0
                return (
                  <li key={month.monthKey} className="rounded-lg border border-line p-3">
                    <p className="font-semibold">{monthLong(month.monthKey, language)}</p>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                      <Side label={t('share.mine')} summary={month.mine} />
                      <Side label={t('share.family')} summary={month.family} />
                    </div>
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <Button variant="secondary" disabled={busy} onClick={() => void resolve(month.monthKey, 'keep_theirs')}>
                        {t('share.keepTheirs')}
                      </Button>
                      <Button
                        variant="secondary"
                        disabled={busy || locked}
                        onClick={() => void resolve(month.monthKey, 'keep_mine')}
                      >
                        {t('share.keepMine')}
                      </Button>
                    </div>
                    {locked && <p className="mt-2 text-sm text-muted">{t('share.familyHasPurchases')}</p>}
                  </li>
                )
              })}
            </ul>
          </section>
        )}
      </div>
    )
  }

  return (
    <Dialog
      open
      onClose={() => { if (!busy) onClose() }}
      title={t('share.title')}
      footer={
        <Button variant="quiet" onClick={onClose} disabled={busy}>
          {t('share.done')}
        </Button>
      }
    >
      <p className="mb-4 text-sm text-muted">{t('share.text')}</p>
      {body}
      {error !== null && (
        <div className="mt-4">
          <Notice tone="error">{errorText(error, t)}</Notice>
        </div>
      )}
    </Dialog>
  )
}

function Side({ label, summary }: { label: string; summary: ShareSummary }) {
  const { t } = useI18n()
  return (
    <div className="rounded-lg bg-track px-3 py-2">
      <p className="text-muted">{label}</p>
      <Money bani={summary.totalBani} className="font-semibold" />
      <p className="text-xs text-muted">{counted(t, 'food.count.purchases', summary.purchaseCount)}</p>
    </div>
  )
}
