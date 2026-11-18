import { Pencil, RotateCcw, Trash2 } from 'lucide-react'
import { useI18n } from '../../lib/i18n.tsx'
import { IconButton } from '../../ui/Button.tsx'
import { cx } from '../../ui/cx.ts'
import { dayLong } from '../budget/month-key.ts'
import { countdown, daysLeft, KINDS, urgencyOf, type Urgency } from './kinds.ts'
import type { Reminder } from './reminders-api.ts'

/* One reminder: an urgency bar and icon, the name with its type and subject,
   the due date with its countdown, the note, and its actions. */

const URGENCY: Record<Urgency, { bar: string; icon: string; text: string }> = {
  overdue: { bar: 'bg-danger', icon: 'text-danger', text: 'text-danger' },
  soon: { bar: 'bg-warning', icon: 'text-warning', text: 'text-warning' },
  ok: { bar: 'bg-brand', icon: 'text-brand', text: 'text-muted' },
  inactive: { bar: 'bg-line-strong', icon: 'text-muted', text: 'text-muted' },
}

interface ReminderRowProps {
  reminder: Reminder
  today: string
  onRenew: (reminder: Reminder) => void
  onEdit: (reminder: Reminder) => void
  onDelete: (reminder: Reminder) => void
}

export function ReminderRow({ reminder, today, onRenew, onEdit, onDelete }: ReminderRowProps) {
  const { t, language } = useI18n()
  const style = URGENCY[urgencyOf(reminder, today)]
  const { Icon } = KINDS[reminder.kind]

  return (
    <li className="relative border-t border-line py-3 pr-1 pl-4 first:border-t-0 sm:pl-5">
      <span aria-hidden="true" className={cx('absolute inset-y-0 left-0 w-1', style.bar)} />
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="flex min-w-0 flex-1 basis-56 items-center gap-3">
          <Icon aria-hidden="true" className={cx('size-5 shrink-0', style.icon)} />
          <div className="min-w-0">
            <h3 className={cx('flex flex-wrap items-baseline gap-x-2 font-semibold', !reminder.isActive && 'text-muted')}>
              <span className="break-words">{reminder.name}</span>
              {!reminder.isActive && <span className="text-xs font-normal">{t('reminders.inactive')}</span>}
            </h3>
            <p className="text-sm text-muted">
              {t(`reminders.kind.${reminder.kind}`)}
              {reminder.subject ? ` · ${reminder.subject}` : ''}
            </p>
          </div>
        </div>
        <div className="ml-8 flex items-center gap-1 sm:ml-0">
          <div className="mr-1 text-right">
            <p className="text-sm tabular-nums">{dayLong(reminder.dueDate, language)}</p>
            <p className={cx('text-sm font-semibold tabular-nums', style.text)}>
              {reminder.isActive ? countdown(daysLeft(reminder, today), t) : '—'}
            </p>
          </div>
          <IconButton label={t('reminders.renew', { name: reminder.name })} onClick={() => { onRenew(reminder) }}>
            <RotateCcw />
          </IconButton>
          <IconButton label={t('reminders.edit', { name: reminder.name })} onClick={() => { onEdit(reminder) }}>
            <Pencil />
          </IconButton>
          <IconButton
            label={t('reminders.delete', { name: reminder.name })}
            className="hover:text-danger!"
            onClick={() => { onDelete(reminder) }}
          >
            <Trash2 />
          </IconButton>
        </div>
      </div>
      {reminder.notes && <p className="mt-1 ml-8 text-sm break-words text-muted">{reminder.notes}</p>}
    </li>
  )
}
