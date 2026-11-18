import { CreditCard } from 'lucide-react'
import { useState } from 'react'
import { useI18n } from '../../lib/i18n.tsx'
import { ConfirmDialog } from '../../ui/Dialog.tsx'
import { budgetApi, type Entry, type MonthDeletion } from './budget-api.ts'
import { monthLong } from './month-key.ts'

/* Asks before deleting a month. A month holding plan instalments is not
   deleted: its own entries go and the instalments stay, so the dialog says
   which will happen and the button reads "Șterge tranzacțiile". */

interface DeleteMonthDialogProps {
  open: boolean
  monthKey: string
  entries: Entry[]
  onCancel: () => void
  onDone: (result: MonthDeletion) => void
  onFailed: (error: unknown) => void
}

export function DeleteMonthDialog({ open, monthKey, entries, onCancel, onDone, onFailed }: DeleteMonthDialogProps) {
  const { t, language } = useI18n()
  const [busy, setBusy] = useState(false)
  const installments = entries.filter((entry) => entry.plan !== null).length
  const own = entries.length - installments

  const confirm = async () => {
    setBusy(true)
    try {
      onDone(await budgetApi.deleteMonth(monthKey))
    } catch (error) {
      onFailed(error)
    }
    setBusy(false)
  }

  return (
    <ConfirmDialog
      open={open}
      title={`${t('budget.deleteMonth')}: ${monthLong(monthKey, language)}`}
      confirmLabel={installments > 0 ? t('plans.deleteMonthConfirm') : t('budget.deleteMonth')}
      destructive
      busy={busy}
      onConfirm={() => void confirm()}
      onCancel={onCancel}
    >
      {installments === 0 ? (
        entries.length === 0 ? t('budget.deleteMonthEmpty') : t('budget.deleteMonthText', { count: entries.length })
      ) : (
        <div className="flex flex-col gap-3">
          <p>{own === 0 ? t('plans.deleteMonthNoOwn') : t('plans.deleteMonthOwn', { count: own })}</p>
          <p className="flex items-start gap-2 rounded-lg border border-plan/40 bg-hover px-3 py-2 text-sm">
            <CreditCard aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-plan" />
            <span>{t('plans.deleteMonthInstallments', { count: installments })}</span>
          </p>
        </div>
      )}
    </ConfirmDialog>
  )
}
