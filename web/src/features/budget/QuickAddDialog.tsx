import { useId, useState, type SubmitEvent } from 'react'
import { ApiError, errorText } from '../../lib/api.ts'
import { useI18n } from '../../lib/i18n.tsx'
import { parseAmount } from '../../lib/money.ts'
import { Button } from '../../ui/Button.tsx'
import { cx } from '../../ui/cx.ts'
import { Dialog } from '../../ui/Dialog.tsx'
import { Field } from '../../ui/Field.tsx'
import { Notice } from '../../ui/Notice.tsx'
import { budgetApi } from './budget-api.ts'
import { CategoryPicker } from './EntryFields.tsx'
import { monthLong, monthShort, shiftMonth } from './month-key.ts'

/* An expense in a few taps, for the month on screen or one of the next two.
   A month without a budget gets one first. Categories offered: a few common
   ones, then the month's own, nine at most. */

interface QuickAddDialogProps {
  monthKey: string
  categoryNames: string[]
  monthsWithBudget: ReadonlySet<string>
  onClose: () => void
  onMonthCreated: (monthKey: string) => void
  onSaved: (monthKey: string) => void
}

type Errors = Partial<Record<'amount' | 'description' | 'category', string>>

export function QuickAddDialog({ monthKey, categoryNames, monthsWithBudget, onClose, onMonthCreated, onSaved }: QuickAddDialogProps) {
  const { t, language } = useI18n()
  const formId = useId()
  const monthGroupId = useId()
  const [target, setTarget] = useState(monthKey)
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('')
  const [paymentDate, setPaymentDate] = useState('')
  const [errors, setErrors] = useState<Errors>({})
  const [failure, setFailure] = useState<unknown>(null)
  const [saving, setSaving] = useState(false)

  const targets = [monthKey, shiftMonth(monthKey, 1), shiftMonth(monthKey, 2)]
  const suggestions = [...new Set([...t('budget.commonCategories').split('|'), ...categoryNames])].slice(0, 9)

  const submit = async (event: SubmitEvent) => {
    event.preventDefault()
    const amountBani = parseAmount(amount)
    const found: Errors = {}
    if (amountBani === null) found.amount = t('budget.amountInvalid')
    if (description.trim() === '') found.description = t('budget.descriptionRequired')
    if (category.trim() === '') found.category = t('budget.categoryRequired')
    setErrors(found)
    if (amountBani === null || Object.keys(found).length > 0) return

    setSaving(true)
    setFailure(null)
    try {
      if (!monthsWithBudget.has(target)) {
        // Another tab may have started the month since the page loaded.
        await budgetApi.createMonth(target).catch((error: unknown) => {
          if (!(error instanceof ApiError && error.code === 'month_exists')) throw error
        })
        onMonthCreated(target)
      }
      await budgetApi.addEntry({
        monthKey: target,
        categoryName: category.trim(),
        description: description.trim(),
        type: 'expense',
        amountBani,
        paymentDate: paymentDate || null,
      })
      onSaved(target)
      onClose()
    } catch (error) {
      setFailure(error)
      setSaving(false)
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={t('budget.quickExpense')}
      footer={
        <>
          <Button variant="quiet" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form={formId} disabled={saving}>
            {saving ? t('common.saving') : t('budget.addExpense')}
          </Button>
        </>
      }
    >
      <form id={formId} noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-5">
        <div role="group" aria-labelledby={monthGroupId} className="flex flex-col gap-1.5">
          <span id={monthGroupId} className="text-sm font-semibold">
            {t('budget.month')}
          </span>
          <div className="grid grid-cols-3 gap-2">
            {targets.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={target === option}
                aria-label={monthLong(option, language)}
                onClick={() => { setTarget(option) }}
                className={cx(
                  'min-h-11 pointer-fine:min-h-9 truncate rounded-lg border px-2 text-sm transition-colors duration-150',
                  target === option ? 'border-expense font-semibold text-expense' : 'border-line-strong hover:bg-hover',
                )}
              >
                {monthShort(option, language, monthKey.slice(0, 4))}
              </button>
            ))}
          </div>
        </div>
        <Field
          label={t('budget.description')}
          data-autofocus
          value={description}
          maxLength={512}
          error={errors.description}
          onChange={(event) => { setDescription(event.target.value) }}
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label={`${t('budget.amount')} (${t('amounts.currency')})`}
            inputMode="decimal"
            autoComplete="off"
            placeholder="0"
            value={amount}
            error={errors.amount}
            onChange={(event) => { setAmount(event.target.value) }}
          />
          <Field
            type="date"
            label={t('budget.paymentDate')}
            value={paymentDate}
            onChange={(event) => { setPaymentDate(event.target.value) }}
          />
        </div>
        <CategoryPicker value={category} onChange={setCategory} suggestions={suggestions} error={errors.category} />
        {failure !== null && <Notice tone="error">{errorText(failure, t)}</Notice>}
      </form>
    </Dialog>
  )
}
