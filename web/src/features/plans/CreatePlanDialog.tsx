import { X } from 'lucide-react'
import { useId, useState, type SubmitEvent } from 'react'
import { errorText } from '../../lib/api.ts'
import { useI18n } from '../../lib/i18n.tsx'
import { parseAmount } from '../../lib/money.ts'
import { Button, IconButton } from '../../ui/Button.tsx'
import { Dialog } from '../../ui/Dialog.tsx'
import { Field, Select } from '../../ui/Field.tsx'
import { Money } from '../../ui/Money.tsx'
import { Notice } from '../../ui/Notice.tsx'
import { CategoryPicker } from '../budget/EntryFields.tsx'
import { currentMonthKey, monthLong, monthRange } from '../budget/month-key.ts'
import { MAX_INSTALLMENTS, plansApi, splitPreview } from './plans-api.ts'

/* A new plan: name, total, number of instalments, first month, category and
   an optional purchase date. The preview shows the instalments exactly as
   the server will split them. The first month is this month or one of the
   23 after it. */

interface Errors {
  name?: string
  amount?: string
  count?: string
  category?: string
}

function readCount(text: string): number | null {
  const count = /^\d{1,3}$/.test(text.trim()) ? Number(text) : 0
  return count >= 1 && count <= MAX_INSTALLMENTS ? count : null
}

interface CreatePlanDialogProps {
  onClose: () => void
  onCreated: () => void
}

export function CreatePlanDialog({ onClose, onCreated }: CreatePlanDialogProps) {
  const { t, language } = useI18n()
  const formId = useId()
  const firstMonths = monthRange(currentMonthKey(), 0, 23)
  const categoryChoices = t('plans.categoryChoices').split('|')
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [count, setCount] = useState('')
  const [firstMonth, setFirstMonth] = useState(firstMonths[0] ?? '')
  const [category, setCategory] = useState(categoryChoices[0] ?? '')
  const [purchaseDate, setPurchaseDate] = useState('')
  const [errors, setErrors] = useState<Errors>({})
  const [failure, setFailure] = useState<unknown>(null)
  const [saving, setSaving] = useState(false)

  const parsed = parseAmount(amount)
  const totalBani = parsed !== null && parsed > 0 ? parsed : null
  const installmentCount = readCount(count)
  const preview = totalBani && installmentCount ? splitPreview(totalBani, installmentCount) : null

  const submit = async (event: SubmitEvent) => {
    event.preventDefault()
    const found: Errors = {}
    if (!name.trim()) found.name = t('plans.nameRequired')
    if (!totalBani) found.amount = t('plans.amountInvalid')
    if (!installmentCount) found.count = t('plans.countInvalid')
    if (!category.trim()) found.category = t('plans.categoryRequired')
    setErrors(found)
    if (!totalBani || !installmentCount || Object.keys(found).length > 0) return

    setSaving(true)
    setFailure(null)
    try {
      await plansApi.create({
        name: name.trim(),
        totalBani,
        installmentCount,
        firstMonthKey: firstMonth,
        categoryName: category.trim(),
        purchaseDate: purchaseDate || null,
      })
      onCreated()
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
      title={t('plans.newTitle')}
      footer={
        <>
          <Button variant="quiet" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form={formId} disabled={saving}>
            {saving ? t('plans.creating') : t('plans.create')}
          </Button>
        </>
      }
    >
      <form id={formId} noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-5">
        <p className="-mt-1 text-sm text-muted">{t('plans.newHint')}</p>
        <Field
          label={t('plans.name')}
          placeholder={t('plans.namePlaceholder')}
          value={name}
          maxLength={256}
          error={errors.name}
          data-autofocus
          onChange={(event) => { setName(event.target.value) }}
        />
        <div className="grid grid-cols-2 gap-3">
          <Field
            label={t('plans.totalAmount')}
            inputMode="decimal"
            autoComplete="off"
            value={amount}
            error={errors.amount}
            onChange={(event) => { setAmount(event.target.value) }}
          />
          <Field
            label={t('plans.count')}
            inputMode="numeric"
            autoComplete="off"
            value={count}
            error={errors.count}
            onChange={(event) => { setCount(event.target.value) }}
          />
        </div>
        {preview && (
          <p role="status" className="rounded-lg border border-plan/40 bg-hover px-3 py-2 text-sm text-ink">
            {preview.first === preview.regular ? (
              <>
                {t('plans.monthly')}: <Money bani={preview.regular} className="font-semibold" />
              </>
            ) : (
              <SplitText first={preview.first} regular={preview.regular} />
            )}
          </p>
        )}
        <Select label={t('plans.firstMonth')} value={firstMonth} onChange={(event) => { setFirstMonth(event.target.value) }}>
          {firstMonths.map((month) => (
            <option key={month} value={month}>
              {monthLong(month, language)}
            </option>
          ))}
        </Select>
        <CategoryPicker value={category} onChange={setCategory} suggestions={categoryChoices} error={errors.category} />
        <Field
          type="date"
          label={t('plans.purchaseDateOptional')}
          hint={t('plans.purchaseDateHint')}
          value={purchaseDate}
          onChange={(event) => { setPurchaseDate(event.target.value) }}
          trailing={
            purchaseDate ? (
              <IconButton label={t('plans.clearPurchaseDate')} onClick={() => { setPurchaseDate('') }}>
                <X />
              </IconButton>
            ) : undefined
          }
        />
        {failure !== null && <Notice tone="error">{errorText(failure, t)}</Notice>}
      </form>
    </Dialog>
  )
}

// "Prima rată 666,68 lei, apoi 666,66 lei pe lună", with both amounts through <Money>.
function SplitText({ first, regular }: { first: number; regular: number }) {
  const { t } = useI18n()
  const [before = '', middle = '', after = ''] = t('plans.splitFirst').split(/\{first\}|\{regular\}/)
  return (
    <>
      {before}
      <Money bani={first} className="font-semibold" />
      {middle}
      <Money bani={regular} className="font-semibold" />
      {after}
    </>
  )
}
