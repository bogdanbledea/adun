import { ChevronLeft, ChevronRight, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState, type SubmitEvent } from 'react'
import { errorText } from '../../lib/api.ts'
import { useI18n } from '../../lib/i18n.tsx'
import { Button, IconButton } from '../../ui/Button.tsx'
import { cx } from '../../ui/cx.ts'
import { Dialog } from '../../ui/Dialog.tsx'
import { Field } from '../../ui/Field.tsx'
import { Notice } from '../../ui/Notice.tsx'
import { Skeleton } from '../../ui/Skeleton.tsx'
import { Switch } from '../../ui/Switch.tsx'
import { currentMonthKey, dayLong, dayShort } from '../budget/month-key.ts'
import { foodApi, type CalendarDay, type WorkCalendar } from './food-api.ts'
import { formatWeekday } from './food-format.ts'

/* The calendar payday is counted on. The legal holidays are only a default:
   each can be switched to a working day, and any other day added as a day
   off, on this account only. With the payday rule, the year's paydays show
   what the corrections lead to. The calendar is known from 2024 to 2099. */

const FIRST_YEAR = 2024
const LAST_YEAR = 2099

const isWeekend = (date: string) => [0, 6].includes(new Date(`${date}T00:00:00Z`).getUTCDay())

export function WorkCalendarDialog({ onClose }: { onClose: () => void }) {
  const { t, language } = useI18n()
  const [year, setYear] = useState(() => Math.min(Math.max(Number(currentMonthKey().slice(0, 4)), FIRST_YEAR), LAST_YEAR))
  const [data, setData] = useState<WorkCalendar | null>(null)
  const [loadError, setLoadError] = useState<unknown>(null)
  const [failure, setFailure] = useState<unknown>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [newDate, setNewDate] = useState('')
  const [newNote, setNewNote] = useState('')

  const load = useCallback(
    (signal?: AbortSignal) =>
      foodApi
        .calendar(year, signal)
        .then((next) => {
          setData(next)
          setLoadError(null)
        })
        .catch((error: unknown) => {
          if (!signal?.aborted) setLoadError(error)
        }),
    [year],
  )

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => { controller.abort() }
  }, [load])

  const run = async (key: string, action: () => Promise<unknown>) => {
    setBusy(key)
    setFailure(null)
    try {
      await action()
      await load()
    } catch (error) {
      setFailure(error)
    }
    setBusy(null)
  }

  const toggleHoliday = (day: CalendarDay) =>
    run(day.date, () => (day.override ? foodApi.resetDay(day.date) : foodApi.setDay(day.date, 'working')))

  const addDayOff = (event: SubmitEvent) => {
    event.preventDefault()
    if (!newDate) return
    void run('new', async () => {
      await foodApi.setDay(newDate, 'off', newNote.trim() || null)
      setNewDate('')
      setNewNote('')
    })
  }

  const shown = data?.year === year ? data : null
  // Two holidays can share a date (Pentecost Monday and Children's Day in 2026): one switch per date.
  const legal = shown?.days.filter((d, i, all) => d.legal && all.findIndex((x) => x.date === d.date) === i) ?? []
  const names = (date: string) =>
    (shown?.days ?? []).flatMap((d) => (d.date === date && d.holiday ? [t(`holiday.${d.holiday}`)] : [])).join(' · ')
  const added = shown?.days.filter((d) => !d.legal) ?? []
  const thisMonth = currentMonthKey()
  const monthShort = (monthKey: string) =>
    new Intl.DateTimeFormat(language === 'ro' ? 'ro-RO' : 'en-GB', { month: 'short', timeZone: 'UTC' }).format(
      new Date(`${monthKey}-01T00:00:00Z`),
    )

  return (
    <Dialog open onClose={onClose} title={t('calendar.title')}>
      <div className="flex flex-col gap-5">
        <p className="-mt-1 text-sm text-muted">{t('calendar.text')}</p>

        <div className="flex items-center justify-center gap-1">
          <IconButton
            label={t('calendar.previousYear')}
            disabled={year <= FIRST_YEAR}
            onClick={() => { setYear((y) => Math.max(FIRST_YEAR, y - 1)) }}
          >
            <ChevronLeft />
          </IconButton>
          <span className="min-w-16 text-center font-display text-lg font-semibold tabular-nums">{year}</span>
          <IconButton
            label={t('calendar.nextYear')}
            disabled={year >= LAST_YEAR}
            onClick={() => { setYear((y) => Math.min(LAST_YEAR, y + 1)) }}
          >
            <ChevronRight />
          </IconButton>
        </div>

        {loadError !== null && !shown ? (
          <div className="flex flex-col items-start gap-2">
            <Notice tone="error">
              {t('calendar.loadFailed')} {errorText(loadError, t)}
            </Notice>
            <Button variant="quiet" onClick={() => void load()}>
              {t('common.tryAgain')}
            </Button>
          </div>
        ) : !shown ? (
          <div aria-busy="true" aria-label={t('common.loading')} className="flex flex-col gap-2">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-11 w-full" />)}
          </div>
        ) : (
          <>
            {shown.rule === 'working_day' && (
              <section aria-labelledby="calendar-paydays">
                <h3 id="calendar-paydays" className="mb-2 font-sans text-sm font-semibold">
                  {t('calendar.paydays', { year })}
                </h3>
                <ul className="grid grid-cols-4 gap-1.5">
                  {shown.paydays.map((p) => (
                    <li
                      key={p.monthKey}
                      className={cx('rounded-lg border px-2 py-1.5 text-center', p.monthKey === thisMonth ? 'border-brand bg-hover' : 'border-line')}
                    >
                      <span className="block text-xs text-muted uppercase">{monthShort(p.monthKey)}</span>
                      <span className="block text-sm font-semibold">{dayShort(p.date, language)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section aria-labelledby="calendar-legal">
              <h3 id="calendar-legal" className="mb-2 font-sans text-sm font-semibold">
                {t('calendar.legal')}
              </h3>
              <ul className="divide-y divide-line rounded-lg border border-line">
                {legal.map((day) => {
                  const off = day.override !== 'working'
                  const name = names(day.date)
                  return (
                    <li key={day.date} className="flex items-center gap-3 px-3 py-2">
                      <span className={cx('min-w-0 flex-1', !off && 'text-muted')}>
                        <span className={cx('block truncate font-semibold', !off && 'line-through')}>{name}</span>
                        <span className="block text-xs text-muted">
                          {formatWeekday(day.date, language)}
                          {isWeekend(day.date) && ` · ${t('calendar.weekend')}`}
                        </span>
                      </span>
                      <span className="text-xs font-semibold text-muted">{off ? t('calendar.dayOff') : t('calendar.work')}</span>
                      <Switch
                        label={t('calendar.dayOffLabel', { name, date: dayLong(day.date, language) })}
                        checked={off}
                        disabled={busy === day.date}
                        onChange={() => void toggleHoliday(day)}
                      />
                    </li>
                  )
                })}
              </ul>
              <p className="mt-1.5 text-sm text-muted">{t('calendar.legalHelp')}</p>
            </section>

            <section aria-labelledby="calendar-added">
              <h3 id="calendar-added" className="mb-2 font-sans text-sm font-semibold">
                {t('calendar.added')}
              </h3>
              {added.length > 0 && (
                <ul className="mb-3 divide-y divide-line rounded-lg border border-line">
                  {added.map((day) => (
                    <li key={day.date} className="flex items-center gap-3 py-1 pr-1 pl-3">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">
                          {day.override === 'working' ? t('calendar.workingDay') : (day.note ?? t('calendar.dayOff'))}
                        </span>
                        <span className="block text-xs text-muted">{formatWeekday(day.date, language)}</span>
                      </span>
                      <IconButton
                        label={t('calendar.removeDay', { date: dayLong(day.date, language) })}
                        disabled={busy === day.date}
                        onClick={() => void run(day.date, () => foodApi.resetDay(day.date))}
                      >
                        {day.override === 'working' ? <RotateCcw /> : <Trash2 />}
                      </IconButton>
                    </li>
                  ))}
                </ul>
              )}
              <form onSubmit={addDayOff} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
                <Field
                  type="date"
                  label={t('calendar.newDate')}
                  value={newDate}
                  min={`${String(year)}-01-01`}
                  max={`${String(year)}-12-31`}
                  onChange={(event) => { setNewDate(event.target.value) }}
                />
                <Field
                  label={t('calendar.note')}
                  value={newNote}
                  maxLength={64}
                  placeholder={t('calendar.notePlaceholder')}
                  onChange={(event) => { setNewNote(event.target.value) }}
                />
                <Button type="submit" disabled={!newDate || busy === 'new'}>
                  <Plus />
                  {t('calendar.add')}
                </Button>
              </form>
            </section>

            {failure !== null && <Notice tone="error">{errorText(failure, t)}</Notice>}
            <p className="text-sm text-muted">{t('calendar.keepStart')}</p>
          </>
        )}
      </div>
    </Dialog>
  )
}
