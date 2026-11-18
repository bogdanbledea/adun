import { Check } from 'lucide-react'
import { useId } from 'react'
import { useT } from '../../lib/i18n.tsx'
import { cx } from '../../ui/cx.ts'
import { Field, Select } from '../../ui/Field.tsx'
import type { EntryType } from './budget-api.ts'

/* The parts of the entry dialog that are more than a plain field. */

const TYPES: EntryType[] = ['income', 'expense']

const AMOUNT_COLOUR: Record<EntryType, string> = {
  income: 'text-income border-income',
  expense: 'text-expense border-expense',
}

interface AmountPanelProps {
  type: EntryType
  amount: string
  error?: string
  /** An instalment is always an expense. */
  typeFixed?: boolean
  onTypeChange: (type: EntryType) => void
  onAmountChange: (amount: string) => void
}

/** The type and the amount are one decision, so they come first, together. */
export function AmountPanel({ type, amount, error, typeFixed, onTypeChange, onAmountChange }: AmountPanelProps) {
  const t = useT()
  const amountId = useId()
  return (
    <div className="flex flex-col gap-4 rounded-lg bg-hover p-4">
      <Select
        label={t('budget.type')}
        hint={t(`kind.${type}Hint`)}
        value={type}
        disabled={typeFixed}
        onChange={(event) => { onTypeChange(event.target.value as EntryType) }}
      >
        {TYPES.map((option) => (
          <option key={option} value={option}>
            {t(`kind.${option}`)}
          </option>
        ))}
      </Select>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={amountId} className="text-sm font-semibold">
          {t('budget.amount')}
        </label>
        <div className="flex items-end gap-2">
          <input
            id={amountId}
            data-autofocus
            inputMode="decimal"
            autoComplete="off"
            placeholder="0"
            value={amount}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${amountId}-error` : undefined}
            onChange={(event) => { onAmountChange(event.target.value) }}
            className={cx(
              'min-h-12 w-full border-0 border-b-2 bg-transparent px-1 text-right font-display text-2xl font-semibold tabular-nums',
              error ? 'border-danger text-danger' : AMOUNT_COLOUR[type],
            )}
          />
          <span className="pb-2 text-muted">{t('amounts.currency')}</span>
        </div>
        {error && (
          <p id={`${amountId}-error`} className="text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}

interface CategoryPickerProps {
  value: string
  onChange: (name: string) => void
  /** Offered as one-tap choices. */
  suggestions: string[]
  error?: string
}

/** Tap an existing category or type a new one; a category is matched by its exact name. */
export function CategoryPicker({ value, onChange, suggestions, error }: CategoryPickerProps) {
  const t = useT()
  const groupId = useId()
  return (
    <div className="flex flex-col gap-2">
      {suggestions.length > 0 && (
        <div role="group" aria-labelledby={groupId} className="flex flex-col gap-1.5">
          <span id={groupId} className="text-sm font-semibold">
            {t('budget.category')}
          </span>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((name) => {
              const selected = value === name
              return (
                <button
                  key={name}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => { onChange(selected ? '' : name) }}
                  className={cx(
                    'inline-flex min-h-11 pointer-fine:min-h-9 max-w-full items-center gap-1.5 rounded-full border px-3.5 text-sm transition-colors duration-150',
                    selected ? 'border-brand bg-brand text-on-brand' : 'border-line-strong hover:bg-hover',
                  )}
                >
                  {selected && <Check aria-hidden="true" className="size-4 shrink-0" />}
                  <span className="truncate">{name}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
      <Field
        label={suggestions.length > 0 ? t('budget.newCategory') : t('budget.category')}
        placeholder={t('budget.newCategoryPlaceholder')}
        value={value}
        maxLength={256}
        error={error}
        onChange={(event) => { onChange(event.target.value) }}
      />
    </div>
  )
}
