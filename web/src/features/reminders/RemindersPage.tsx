import { BellRing } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { PageHeader } from '../../layout/PageHeader.tsx'
import { errorText } from '../../lib/api.ts'
import { useT } from '../../lib/i18n.tsx'
import { useServerStatus } from '../../lib/server-status.ts'
import { Button } from '../../ui/Button.tsx'
import { ConfirmDialog } from '../../ui/Dialog.tsx'
import { EmptyState } from '../../ui/EmptyState.tsx'
import { Notice } from '../../ui/Notice.tsx'
import { Skeleton } from '../../ui/Skeleton.tsx'
import { todayDate } from '../budget/month-key.ts'
import { urgencyOf } from './kinds.ts'
import { ReminderRow } from './ReminderRow.tsx'
import { remindersApi, type Reminder } from './reminders-api.ts'

/* /scadente: due dates, active ones first and the nearest on top. The days
   left are counted from the browser's date. Emails come from the server's
   hourly sweep; with email off the page says so and works the same. After
   each change the list is read again. */

export function RemindersPage() {
  const t = useT()
  const status = useServerStatus()
  // Until the server answers, assume what most servers do.
  const emailEnabled = status?.emailEnabled ?? true
  const [reminders, setReminders] = useState<Reminder[] | null>(null)
  const [loadError, setLoadError] = useState<unknown>(null)
  const [deleting, setDeleting] = useState<Reminder | null>(null)
  const [failure, setFailure] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  const today = todayDate()

  const load = useCallback(
    (signal?: AbortSignal) =>
      remindersApi
        .list(signal)
        .then((list) => {
          setReminders(list)
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

  const remove = async (reminder: Reminder) => {
    setBusy(true)
    setFailure(null)
    try {
      await remindersApi.remove(reminder.id)
      await load()
    } catch (error) {
      setFailure(error)
    }
    setBusy(false)
    setDeleting(null)
  }

  const attention = reminders?.filter((reminder) => ['overdue', 'soon'].includes(urgencyOf(reminder, today))).length ?? 0

  let body
  if (loadError !== null && !reminders) {
    body = (
      <>
        <Notice tone="error">
          {t('reminders.loadFailed')} {errorText(loadError, t)}
        </Notice>
        <Button variant="quiet" className="mt-2" onClick={() => void load()}>
          {t('common.tryAgain')}
        </Button>
      </>
    )
  } else if (!reminders) {
    body = (
      <div aria-busy="true" aria-label={t('common.loading')} className="flex flex-col gap-px card">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center justify-between gap-4 px-5 py-4">
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-5 w-1/2" />
              <Skeleton className="h-4 w-1/4" />
            </div>
            <Skeleton className="h-9 w-28" />
          </div>
        ))}
      </div>
    )
  } else if (reminders.length === 0) {
    body = (
      <EmptyState icon={<BellRing />} title={t('reminders.empty')}>
        {emailEnabled ? t('reminders.emptyText') : t('reminders.emptyTextNoEmail')}
      </EmptyState>
    )
  } else {
    body = (
      <section aria-labelledby="reminders-list" className="overflow-hidden card">
        <h2 id="reminders-list" className="sr-only">
          {t('reminders.list')}
        </h2>
        <ul>
          {reminders.map((reminder) => (
            <ReminderRow key={reminder.id} reminder={reminder} today={today} onDelete={setDeleting} />
          ))}
        </ul>
      </section>
    )
  }

  return (
    <>
      <PageHeader
        title={t('reminders.title')}
        subtitle={
          attention === 0
            ? t('reminders.subtitle')
            : attention === 1
              ? t('reminders.attentionOne')
              : t('reminders.attentionMany', { count: attention })
        }
      />
      {!emailEnabled && (
        <div className="mb-4">
          <Notice>{t('reminders.emailOff')}</Notice>
        </div>
      )}
      {failure !== null && (
        <div className="mb-4">
          <Notice tone="error">
            {t('reminders.actionFailed')} {errorText(failure, t)}
          </Notice>
        </div>
      )}
      {body}
      <ConfirmDialog
        open={deleting !== null}
        title={deleting ? t('reminders.deleteTitle', { name: deleting.name }) : ''}
        confirmLabel={t('common.delete')}
        destructive
        busy={busy}
        onConfirm={() => { if (deleting) void remove(deleting) }}
        onCancel={() => { setDeleting(null) }}
      >
        {t('reminders.deleteText')}
      </ConfirmDialog>
    </>
  )
}
