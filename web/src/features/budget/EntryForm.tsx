import { useId, useState, type SubmitEvent } from 'react'
import { errorText } from '../../lib/api.ts'
import { useI18n } from '../../lib/i18n.tsx'
import { Button } from '../../ui/Button.tsx'
import { cx } from '../../ui/cx.ts'
import { Field } from '../../ui/Field.tsx'
import { Notice } from '../../ui/Notice.tsx'
import { budgetApi, type EntryType, type SavedEntry } from './budget-api.ts'
import { baniToInput, parseAmount } from './money.ts'
import { isMonthKey } from './month-key.ts'

/* Adds an entry or changes one. The category is typed, with the month's
   categories offered; a new name makes a new category. When changing an
   entry its month can change too, which moves it there. The amount is read
   by parseAmount, so "12,50" and "12.50" both work. */

export interface EditedEntry {
  id: string
  description: string
  categoryName: string
  type: EntryType
  amountBani: number
}

interface EntryFormProps {
  monthKey: string
  /** The entry to change; without it, the form adds one. */
  entry?: EditedEntry
  /** Filled in when adding from a category. */
  categoryName?: string
  categoryNames: string[]
  onSaved: (entry: SavedEntry) => void
  onDeleted: () => void
  onCancel: () => void
}

type Errors = Partial<Record<'description' | 'categoryName' | 'amount' | 'monthKey', string>>

export function EntryForm({ monthKey, entry, categoryName = '', categoryNames, onSaved, onDeleted, onCancel }: EntryFormProps) {
  const { t, language } = useI18n()
  const listId = useId()
  const [type, setType] = useState<EntryType>(entry?.type ?? 'expense')
  const [description, setDescription] = useState(entry?.description ?? '')
  const [category, setCategory] = useState(entry?.categoryName ?? categoryName)
  const [amount, setAmount] = useState(entry ? baniToInput(entry.amountBani, language) : '')
  const [month, setMonth] = useState(monthKey)
  const [errors, setErrors] = useState<Errors>({})
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<unknown>(null)
  const [askingDelete, setAskingDelete] = useState(false)

  const submit = async (event: SubmitEvent) => {
    event.preventDefault()
    const amountBani = parseAmount(amount)
    const found: Errors = {}
    if (description.trim() === '') found.description = t('budget.descriptionRequired')
    if (category.trim() === '') found.categoryName = t('budget.categoryRequired')
    if (amountBani === null) found.amount = t('budget.amountInvalid')
    if (!isMonthKey(month)) found.monthKey = t('budget.monthInvalid')
    setErrors(found)
    if (amountBani === null || Object.keys(found).length > 0) return

    const fields = { monthKey: month, categoryName: category.trim(), description: description.trim(), type, amountBani }
    setBusy(true)
    setFailure(null)
    try {
      onSaved(entry ? await budgetApi.updateEntry(entry.id, fields) : await budgetApi.addEntry(fields))
    } catch (error) {
      setFailure(error)
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!entry) return
    setBusy(true)
    setFailure(null)
    try {
      await budgetApi.deleteEntry(entry.id)
      onDeleted()
    } catch (error) {
      setFailure(error)
      setBusy(false)
    }
  }

  const types: { value: EntryType; label: string }[] = [
    { value: 'expense', label: t('budget.expense') },
    { value: 'income', label: t('budget.incomeOne') },
  ]

  return (
    <form
      aria-label={entry ? t('budget.editEntry') : t('budget.addEntry')}
      onSubmit={(event) => void submit(event)}
      noValidate
      className="flex flex-col gap-4 px-4 py-4"
    >
      <fieldset className="flex w-fit gap-1 rounded-full bg-track p-1">
        <legend className="sr-only">{t('budget.type')}</legend>
        {types.map((option) => (
          <label
            key={option.value}
            className={cx(
              'flex min-h-9 cursor-pointer items-center rounded-full px-4 text-sm font-semibold transition-colors duration-150',
              'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-gold',
              type === option.value ? 'bg-paper text-brand-deep shadow-sm' : 'text-muted hover:text-ink',
            )}
          >
            <input
              type="radio"
              name="type"
              value={option.value}
              checked={type === option.value}
              onChange={() => { setType(option.value) }}
              className="sr-only"
            />
            {option.label}
          </label>
        ))}
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={t('budget.description')}
          value={description}
          maxLength={512}
          error={errors.description}
          onChange={(event) => { setDescription(event.target.value) }}
        />
        <Field
          label={t('budget.amount')}
          inputMode="decimal"
          autoComplete="off"
          placeholder={language === 'ro' ? '0,00' : '0.00'}
          value={amount}
          error={errors.amount}
          onChange={(event) => { setAmount(event.target.value) }}
        />
        <Field
          label={t('budget.category')}
          list={listId}
          autoComplete="off"
          value={category}
          maxLength={256}
          error={errors.categoryName}
          onChange={(event) => { setCategory(event.target.value) }}
        />
        <datalist id={listId}>
          {categoryNames.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        {entry && (
          <Field
            label={t('budget.month')}
            type="month"
            hint={t('budget.monthHint')}
            value={month}
            error={errors.monthKey}
            onChange={(event) => { setMonth(event.target.value) }}
          />
        )}
      </div>
      {failure !== null && <Notice tone="error">{errorText(failure, t)}</Notice>}
      {askingDelete ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <p className="mr-auto text-sm">{t('budget.deleteEntryConfirm')}</p>
          <Button variant="quiet" disabled={busy} onClick={() => { setAskingDelete(false) }}>
            {t('budget.cancel')}
          </Button>
          <Button variant="danger" disabled={busy} onClick={() => void remove()}>
            {t('budget.deleteEntryYes')}
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {entry && (
            <Button variant="quiet" disabled={busy} className="mr-auto text-danger! hover:text-danger!" onClick={() => { setAskingDelete(true) }}>
              {t('budget.deleteEntry')}
            </Button>
          )}
          <Button variant="quiet" disabled={busy} onClick={onCancel}>
            {t('budget.cancel')}
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? t('budget.saving') : t('budget.save')}
          </Button>
        </div>
      )}
    </form>
  )
}
