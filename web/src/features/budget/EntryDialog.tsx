import { ArrowRight, Trash2 } from 'lucide-react'
import { useId, useState, type SubmitEvent } from 'react'
import { errorText } from '../../lib/api.ts'
import { useI18n } from '../../lib/i18n.tsx'
import { baniToInput, parseAmount } from '../../lib/money.ts'
import { Button } from '../../ui/Button.tsx'
import { Dialog } from '../../ui/Dialog.tsx'
import { Field, Select } from '../../ui/Field.tsx'
import { Notice } from '../../ui/Notice.tsx'
import { budgetApi, type Entry, type EntryType, type SavedEntry } from './budget-api.ts'
import { AmountPanel, CategoryPicker } from './EntryFields.tsx'
import { monthLong } from './month-key.ts'

/* Adds an entry to the month or the template, or edits one. Editing a
   month's entry can also move it to another month of the strip; the server
   creates that month's budget if it has none. An instalment stays in the
   month its plan gave it. The amount is read by
   parseAmount, so "12,50" and "12.50" both work. */

interface EntryDialogProps {
  /** null: the template. */
  monthKey: string | null
  /** The months the strip offers, for moving an entry. */
  months?: string[]
  monthsWithBudget?: ReadonlySet<string>
  /** The entry to edit, with its category; absent to add one. */
  entry?: Entry & { categoryName: string }
  /** Preselected category when adding from a category's + button. */
  categoryName?: string
  categoryNames: string[]
  onClose: () => void
  onSaved: (entry: SavedEntry) => void
  onDelete?: (entry: Entry) => void
}

type Errors = Partial<Record<'amount' | 'description' | 'category', string>>

export function EntryDialog({
  monthKey,
  months = [],
  monthsWithBudget = new Set(),
  entry,
  categoryName,
  categoryNames,
  onClose,
  onSaved,
  onDelete,
}: EntryDialogProps) {
  const { t, language } = useI18n()
  const formId = useId()
  const [type, setType] = useState<EntryType>(entry?.type ?? 'income')
  const [amount, setAmount] = useState(entry ? baniToInput(entry.amountBani, language) : '')
  const [description, setDescription] = useState(entry?.description ?? '')
  const [category, setCategory] = useState(entry?.categoryName ?? categoryName ?? '')
  // The template has no month to move from.
  const [targetMonth, setTargetMonth] = useState(monthKey ?? '')
  const [errors, setErrors] = useState<Errors>({})
  const [failure, setFailure] = useState<unknown>(null)
  const [saving, setSaving] = useState(false)

  const moving = Boolean(entry) && monthKey !== null && targetMonth !== monthKey
  const moveOptions = monthKey === null || months.includes(monthKey) ? months : [monthKey, ...months]

  const submit = async (event: SubmitEvent) => {
    event.preventDefault()
    const amountBani = parseAmount(amount)
    const found: Errors = {}
    if (amountBani === null) found.amount = t('budget.amountInvalid')
    if (description.trim() === '') found.description = t('budget.descriptionRequired')
    if (category.trim() === '') found.category = t('budget.categoryRequired')
    setErrors(found)
    if (amountBani === null || Object.keys(found).length > 0) return

    const common = { categoryName: category.trim(), description: description.trim(), type, amountBani }
    setSaving(true)
    setFailure(null)
    try {
      if (monthKey === null) {
        onSaved(entry ? await budgetApi.updateEntry(entry.id, common) : await budgetApi.addTemplateEntry(common))
      } else {
        const fields = { ...common, monthKey: targetMonth }
        onSaved(entry ? await budgetApi.updateEntry(entry.id, fields) : await budgetApi.addEntry(fields))
      }
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
      title={
        monthKey === null
          ? entry
            ? t('template.editTitle')
            : t('template.addTitle')
          : entry
            ? t('budget.editTitle')
            : t('budget.addTitle')
      }
      footer={
        <>
          {entry && onDelete && (
            <Button variant="quiet" className="text-danger! hover:text-danger! sm:mr-auto" onClick={() => { onDelete(entry) }}>
              <Trash2 />
              {t('common.delete')}
            </Button>
          )}
          <Button variant="quiet" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form={formId} disabled={saving}>
            {saving ? t('common.saving') : moving ? t('budget.saveAndMove') : t('common.save')}
          </Button>
        </>
      }
    >
      <form id={formId} noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-5">
        <p className="-mt-1 text-sm text-muted">
          {monthKey === null
            ? t('template.dialogHint')
            : entry?.plan
              ? t('plans.installmentOf', { index: entry.plan.index, total: entry.plan.total, name: entry.plan.name })
              : monthLong(monthKey, language)}
        </p>
        <AmountPanel type={type} amount={amount} error={errors.amount} onTypeChange={setType} onAmountChange={setAmount} />
        <Field
          label={t('budget.description')}
          value={description}
          maxLength={512}
          error={errors.description}
          onChange={(event) => { setDescription(event.target.value) }}
        />
        <CategoryPicker value={category} onChange={setCategory} suggestions={categoryNames} error={errors.category} />
        {entry?.plan && (
          <div>
            <p className="text-sm font-semibold">{t('budget.month')}</p>
            <p className="mt-1 text-sm text-muted">{t('plans.installmentCannotMove')}</p>
          </div>
        )}
        {entry && !entry.plan && monthKey !== null && (
          <div className="flex flex-col gap-2">
            <Select label={t('budget.month')} value={targetMonth} onChange={(event) => { setTargetMonth(event.target.value) }}>
              {moveOptions.map((option) => (
                <option key={option} value={option}>
                  {option === monthKey ? t('budget.thisMonth', { month: monthLong(option, language) }) : monthLong(option, language)}
                </option>
              ))}
            </Select>
            {moving && (
              <p className="flex items-center gap-1 text-sm text-muted">
                <ArrowRight aria-hidden="true" className="size-4" />
                {t('budget.moveTo', { month: monthLong(targetMonth, language) })}
                {!monthsWithBudget.has(targetMonth) && ` — ${t('budget.monthCreatedAutomatically')}`}
              </p>
            )}
          </div>
        )}
        {failure !== null && <Notice tone="error">{errorText(failure, t)}</Notice>}
      </form>
    </Dialog>
  )
}
