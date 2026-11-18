import { useId, useState, type SubmitEvent } from 'react'
import { errorText } from '../../lib/api.ts'
import { useT } from '../../lib/i18n.tsx'
import { Button } from '../../ui/Button.tsx'
import { cx } from '../../ui/cx.ts'
import { Dialog } from '../../ui/Dialog.tsx'
import { Field, Select } from '../../ui/Field.tsx'
import { Notice } from '../../ui/Notice.tsx'
import { Switch } from '../../ui/Switch.tsx'
import { todayDate } from '../budget/month-key.ts'
import { INTERVAL_OPTIONS, intervalLabel, KINDS, LEAD_OPTIONS, leadLabel, MAX_LEAD_COUNT } from './kinds.ts'
import { REMINDER_KINDS, remindersApi, type Reminder, type ReminderKind } from './reminders-api.ts'

/* Adding or editing a reminder: type, name, subject, due date, repeat
   interval, lead days and a note; when editing, also whether it is on.
   Picking a type brings its usual interval and lead days, and its name when
   none is typed yet. Lead days stay between one and five. */

interface Form {
  kind: ReminderKind
  name: string
  subject: string
  dueDate: string
  intervalMonths: string
  leadDays: number[]
  notes: string
  isActive: boolean
}

function initialForm(reminder: Reminder | null): Form {
  if (reminder) {
    return {
      kind: reminder.kind,
      name: reminder.name,
      subject: reminder.subject ?? '',
      dueDate: reminder.dueDate,
      intervalMonths: reminder.intervalMonths ? String(reminder.intervalMonths) : '',
      leadDays: reminder.leadDays,
      notes: reminder.notes ?? '',
      isActive: reminder.isActive,
    }
  }
  return { kind: 'itp', name: '', subject: '', dueDate: '', intervalMonths: '24', leadDays: KINDS.itp.leadDays, notes: '', isActive: true }
}

interface ReminderDialogProps {
  /** null to add a new one. */
  reminder: Reminder | null
  emailEnabled: boolean
  onClose: () => void
  onSaved: () => void
}

export function ReminderDialog({ reminder, emailEnabled, onClose, onSaved }: ReminderDialogProps) {
  const t = useT()
  const formId = useId()
  const [form, setForm] = useState(() => initialForm(reminder))
  const [errors, setErrors] = useState<{ name?: string; dueDate?: string }>({})
  const [failure, setFailure] = useState<unknown>(null)
  const [saving, setSaving] = useState(false)
  const set = (changes: Partial<Form>) => { setForm((current) => ({ ...current, ...changes })) }

  const pickKind = (kind: ReminderKind) => {
    const defaults = KINDS[kind]
    setForm((current) => ({
      ...current,
      kind,
      intervalMonths: defaults.intervalMonths ? String(defaults.intervalMonths) : '',
      leadDays: defaults.leadDays,
      name: current.name.trim() === '' ? t(`reminders.kind.${kind}`) : current.name,
    }))
  }

  const toggleLead = (days: number) => {
    setForm((current) => {
      const has = current.leadDays.includes(days)
      if (has && current.leadDays.length === 1) return current
      if (!has && current.leadDays.length >= MAX_LEAD_COUNT) return current
      const leadDays = has ? current.leadDays.filter((d) => d !== days) : [...current.leadDays, days]
      return { ...current, leadDays: leadDays.sort((a, b) => a - b) }
    })
  }

  // A value outside the usual choices (set through the API) stays visible.
  const leadChoices = [...new Set([...LEAD_OPTIONS, ...form.leadDays])].sort((a, b) => b - a)
  const intervals: number[] = [...INTERVAL_OPTIONS]
  if (form.intervalMonths && !intervals.includes(Number(form.intervalMonths))) intervals.push(Number(form.intervalMonths))

  const submit = async (event: SubmitEvent) => {
    event.preventDefault()
    const found = {
      name: form.name.trim() ? undefined : t('reminders.nameRequired'),
      dueDate: form.dueDate ? undefined : t('reminders.dueDateRequired'),
    }
    setErrors(found)
    if (found.name || found.dueDate) return

    setSaving(true)
    setFailure(null)
    const input = {
      kind: form.kind,
      name: form.name.trim(),
      subject: form.subject.trim() || null,
      dueDate: form.dueDate,
      intervalMonths: form.intervalMonths ? Number(form.intervalMonths) : null,
      leadDays: form.leadDays,
      notes: form.notes.trim() || null,
    }
    try {
      if (reminder) await remindersApi.update(reminder.id, { ...input, isActive: form.isActive })
      else await remindersApi.create(input)
      onSaved()
      onClose()
    } catch (err) {
      setFailure(err)
      setSaving(false)
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={reminder ? t('reminders.editTitle') : t('reminders.newTitle')}
      footer={
        <>
          <Button variant="quiet" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form={formId} disabled={saving}>
            {saving ? t('common.saving') : reminder ? t('reminders.save') : t('reminders.create')}
          </Button>
        </>
      }
    >
      <form id={formId} noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-5">
        <p className="-mt-1 text-sm text-muted">{t('reminders.dialogHint')}</p>

        <fieldset>
          <legend className="mb-1.5 text-sm font-semibold">{t('reminders.type')}</legend>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {REMINDER_KINDS.map((kind) => {
              const { Icon } = KINDS[kind]
              const checked = form.kind === kind
              return (
                <label
                  key={kind}
                  title={t(`reminders.hint.${kind}`)}
                  className={cx(
                    'flex min-h-11 pointer-fine:min-h-9 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border px-2 py-2 text-center text-sm',
                    'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-3 has-[:focus-visible]:outline-gold',
                    checked ? 'border-brand bg-hover font-semibold text-brand' : 'border-line-strong text-muted hover:bg-hover',
                  )}
                >
                  <input
                    type="radio"
                    name={`${formId}-kind`}
                    value={kind}
                    checked={checked}
                    onChange={() => { pickKind(kind) }}
                    className="sr-only"
                  />
                  <Icon aria-hidden="true" className="size-4" />
                  {t(`reminders.kind.${kind}`)}
                </label>
              )
            })}
          </div>
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label={t('reminders.name')}
            placeholder={t('reminders.namePlaceholder')}
            value={form.name}
            maxLength={256}
            error={errors.name}
            onChange={(event) => { set({ name: event.target.value }) }}
          />
          <Field
            label={t('reminders.subject')}
            placeholder={t('reminders.subjectPlaceholder')}
            value={form.subject}
            maxLength={128}
            onChange={(event) => { set({ subject: event.target.value }) }}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            type="date"
            label={t('reminders.dueDate')}
            value={form.dueDate}
            min={reminder ? undefined : todayDate()}
            max="2100-12-31"
            error={errors.dueDate}
            onChange={(event) => { set({ dueDate: event.target.value }) }}
          />
          <Select label={t('reminders.repeats')} value={form.intervalMonths} onChange={(event) => { set({ intervalMonths: event.target.value }) }}>
            <option value="">{t('reminders.noRepeat')}</option>
            {intervals.map((months) => (
              <option key={months} value={String(months)}>
                {intervalLabel(months, t)}
              </option>
            ))}
          </Select>
        </div>

        <fieldset aria-describedby={`${formId}-lead-help`}>
          <legend className="mb-1.5 text-sm font-semibold">{t('reminders.notify')}</legend>
          <div className="flex flex-wrap gap-1.5">
            {leadChoices.map((days) => {
              const checked = form.leadDays.includes(days)
              const unavailable = !checked && form.leadDays.length >= MAX_LEAD_COUNT
              return (
                <label
                  key={days}
                  className={cx(
                    'flex min-h-11 pointer-fine:min-h-9 items-center rounded-full border px-3.5 text-sm tabular-nums',
                    'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-3 has-[:focus-visible]:outline-gold',
                    checked ? 'border-brand bg-hover font-semibold text-brand' : 'border-line-strong text-muted',
                    unavailable ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-hover',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={unavailable}
                    onChange={() => { toggleLead(days) }}
                    className="sr-only"
                  />
                  {leadLabel(days, t)}
                </label>
              )
            })}
          </div>
          <p id={`${formId}-lead-help`} className="mt-1.5 text-sm text-muted">
            {emailEnabled ? t('reminders.leadHelp') : t('reminders.leadHelpNoEmail')}
          </p>
        </fieldset>

        <Field
          label={t('reminders.notes')}
          placeholder={t('reminders.notesPlaceholder')}
          value={form.notes}
          maxLength={512}
          onChange={(event) => { set({ notes: event.target.value }) }}
        />

        {reminder && (
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold">{t('reminders.active')}</p>
              <p className="text-sm text-muted">{t('reminders.activeHint')}</p>
            </div>
            <Switch label={t('reminders.active')} checked={form.isActive} onChange={(isActive) => { set({ isActive }) }} />
          </div>
        )}

        {failure !== null && <Notice tone="error">{errorText(failure, t)}</Notice>}
      </form>
    </Dialog>
  )
}
