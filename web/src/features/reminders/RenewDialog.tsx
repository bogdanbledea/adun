import { RotateCcw } from 'lucide-react'
import { useId, useState, type SubmitEvent } from 'react'
import { errorText } from '../../lib/api.ts'
import { useT } from '../../lib/i18n.tsx'
import { Button } from '../../ui/Button.tsx'
import { Dialog } from '../../ui/Dialog.tsx'
import { Field } from '../../ui/Field.tsx'
import { Notice } from '../../ui/Notice.tsx'
import { todayDate } from '../budget/month-key.ts'
import { takesDe } from './kinds.ts'
import { remindersApi, type Reminder } from './reminders-api.ts'

/* "I renewed it": a repeating reminder moves on by its interval unless a new
   date is given; one that does not repeat needs the date. */

interface RenewDialogProps {
  reminder: Reminder
  onClose: () => void
  onRenewed: () => void
}

export function RenewDialog({ reminder, onClose, onRenewed }: RenewDialogProps) {
  const t = useT()
  const formId = useId()
  const [dueDate, setDueDate] = useState('')
  const [failure, setFailure] = useState<unknown>(null)
  const [saving, setSaving] = useState(false)
  const months = reminder.intervalMonths

  const submit = async (event: SubmitEvent) => {
    event.preventDefault()
    if (!months && !dueDate) return
    setSaving(true)
    setFailure(null)
    try {
      await remindersApi.renew(reminder.id, dueDate || null)
      onRenewed()
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
      title={t('reminders.renewTitle', { name: reminder.name })}
      footer={
        <>
          <Button variant="quiet" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form={formId} disabled={saving || (!months && !dueDate)}>
            <RotateCcw />
            {t('reminders.renewConfirm')}
          </Button>
        </>
      }
    >
      <form id={formId} noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-5">
        <p className="-mt-1 text-sm text-muted">
          {months
            ? t(takesDe(months) ? 'reminders.renewRepeatingDe' : 'reminders.renewRepeating', { months })
            : t('reminders.renewOnce')}
        </p>
        <Field
          type="date"
          label={months ? t('reminders.newDateOptional') : t('reminders.newDate')}
          value={dueDate}
          min={todayDate()}
          max="2100-12-31"
          onChange={(event) => { setDueDate(event.target.value) }}
        />
        {failure !== null && <Notice tone="error">{errorText(failure, t)}</Notice>}
      </form>
    </Dialog>
  )
}
