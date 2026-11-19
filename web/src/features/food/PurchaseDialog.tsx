import { Trash2 } from 'lucide-react'
import { useId, useMemo, useState, type ReactNode, type SubmitEvent } from 'react'
import { errorText } from '../../lib/api.ts'
import { useI18n } from '../../lib/i18n.tsx'
import { baniToInput, parseAmount } from '../../lib/money.ts'
import { Button } from '../../ui/Button.tsx'
import { cx } from '../../ui/cx.ts'
import { Dialog } from '../../ui/Dialog.tsx'
import { Field } from '../../ui/Field.tsx'
import { Money } from '../../ui/Money.tsx'
import { Notice } from '../../ui/Notice.tsx'
import { dayLong, todayDate } from '../budget/month-key.ts'
import { foodApi, type FoodPeriod, type FoodPurchase, type FoodSource } from './food-api.ts'
import { defaultSpentOn, fill, MERCHANT_PRESETS, sameName } from './food-format.ts'

/* Adding or editing a purchase: the amount first, then the shop (one tap for
   the usual ones), the source when there is more than one, the day and a
   note. The day stays inside the month's period; a new purchase starts on
   today, or the nearest end of the period. When editing, the purchase can
   also be deleted. */

const MAX_BANI = 10_000_000

interface PurchaseDialogProps {
  monthKey: string
  period: FoodPeriod
  sources: FoodSource[]
  usedMerchants: string[]
  /** null to add a new one. */
  purchase: FoodPurchase | null
  onClose: () => void
  onSaved: () => void
}

const chip = (checked: boolean) =>
  cx(
    'flex min-h-11 pointer-fine:min-h-9 cursor-pointer items-center rounded-full border px-3.5 text-sm',
    'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-3 has-[:focus-visible]:outline-gold',
    checked ? 'border-brand bg-hover font-semibold text-brand' : 'border-line-strong text-muted hover:bg-hover',
  )

function Chip({ name, checked, onChange, children }: { name: string; checked: boolean; onChange: () => void; children: ReactNode }) {
  return (
    <label className={chip(checked)}>
      <input type="radio" name={name} checked={checked} onChange={onChange} className="sr-only" />
      {children}
    </label>
  )
}

export function PurchaseDialog({ monthKey, period, sources, usedMerchants, purchase, onClose, onSaved }: PurchaseDialogProps) {
  const { t, language } = useI18n()
  const formId = useId()
  const merchants = useMemo(() => {
    const unique: string[] = []
    for (const name of [...MERCHANT_PRESETS, ...usedMerchants]) if (!unique.some((m) => sameName(m, name))) unique.push(name)
    return unique
  }, [usedMerchants])

  const [amount, setAmount] = useState(purchase ? baniToInput(purchase.amountBani, language) : '')
  const [merchant, setMerchant] = useState(purchase?.merchant ?? '')
  const [otherMerchant, setOtherMerchant] = useState(purchase ? !merchants.some((m) => sameName(m, purchase.merchant)) : false)
  // The source with the most left is the likeliest to be paid from next.
  const [sourceId, setSourceId] = useState(
    purchase?.sourceId ?? [...sources].sort((a, b) => b.remainingBani - a.remainingBani)[0]?.id ?? '',
  )
  const [spentOn, setSpentOn] = useState(purchase?.spentOn ?? defaultSpentOn(period, todayDate()))
  const [note, setNote] = useState(purchase?.note ?? '')
  const [errors, setErrors] = useState<{ amount?: string; merchant?: string; source?: string; spentOn?: string }>({})
  const [failure, setFailure] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true)
    setFailure(null)
    try {
      await action()
      onSaved()
      onClose()
    } catch (error) {
      setFailure(error)
      setBusy(false)
    }
  }

  const submit = (event: SubmitEvent) => {
    event.preventDefault()
    const amountBani = parseAmount(amount)
    const found = {
      amount: amountBani === null || amountBani <= 0 || amountBani > MAX_BANI ? t('food.enterAmount') : undefined,
      merchant: merchant.trim() ? undefined : t('food.chooseStore'),
      source: sources.some((s) => s.id === sourceId) ? undefined : t('food.chooseSource'),
      spentOn:
        spentOn >= period.start && spentOn <= period.end
          ? undefined
          : t('food.dateInPeriod', { start: dayLong(period.start, language), end: dayLong(period.end, language) }),
    }
    setErrors(found)
    if (amountBani === null || found.amount || found.merchant || found.source || found.spentOn) return

    const input = { merchant: merchant.trim(), amountBani, spentOn, sourceId, note: note.trim() || null }
    void run(() => (purchase ? foodApi.updatePurchase(purchase.id, input) : foodApi.addPurchase(monthKey, input)))
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={purchase ? t('food.editPurchase') : t('food.newPurchase')}
      footer={
        <>
          <Button variant="quiet" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form={formId} disabled={busy}>
            {busy ? t('common.saving') : purchase ? t('common.save') : t('food.add')}
          </Button>
        </>
      }
    >
      <form id={formId} noValidate onSubmit={submit} className="flex flex-col gap-5">
        <Field
          label={t('food.amount')}
          value={amount}
          inputMode="decimal"
          autoComplete="off"
          placeholder="0"
          data-autofocus={purchase ? undefined : true}
          error={errors.amount}
          className="font-display text-3xl font-semibold tabular-nums"
          onChange={(event) => { setAmount(event.target.value) }}
        />

        <fieldset>
          <legend className="mb-1.5 text-sm font-semibold">{t('food.store')}</legend>
          <div className="flex flex-wrap gap-1.5">
            {merchants.map((name) => (
              <Chip
                key={name}
                name={`${formId}-merchant`}
                checked={!otherMerchant && sameName(name, merchant)}
                onChange={() => {
                  setMerchant(name)
                  setOtherMerchant(false)
                }}
              >
                {name}
              </Chip>
            ))}
            <Chip
              name={`${formId}-merchant`}
              checked={otherMerchant}
              onChange={() => {
                setOtherMerchant(true)
                if (merchants.some((m) => sameName(m, merchant))) setMerchant('')
              }}
            >
              {t('food.otherStore')}
            </Chip>
          </div>
          {otherMerchant && (
            <div className="mt-2">
              <Field
                label={t('food.storeName')}
                value={merchant}
                maxLength={64}
                placeholder={t('food.storePlaceholder')}
                onChange={(event) => { setMerchant(event.target.value) }}
              />
            </div>
          )}
          {errors.merchant && <p className="mt-1.5 text-sm text-danger">{errors.merchant}</p>}
        </fieldset>

        {sources.length > 1 && (
          <fieldset>
            <legend className="mb-1.5 text-sm font-semibold">{t('food.paidWith')}</legend>
            <div className="grid grid-cols-2 gap-1.5">
              {sources.map((source) => (
                <Chip
                  key={source.id}
                  name={`${formId}-source`}
                  checked={sourceId === source.id}
                  onChange={() => { setSourceId(source.id) }}
                >
                  <span className="flex min-w-0 flex-col py-1.5">
                    <span className="truncate">{source.name}</span>
                    <span className="text-xs font-normal text-muted">
                      {fill(t('food.sourceLeft'), {
                        amount: <Money bani={source.remainingBani} signed tone={source.remainingBani < 0 ? 'expense' : 'plain'} />,
                      })}
                    </span>
                  </span>
                </Chip>
              ))}
            </div>
            {errors.source && <p className="mt-1.5 text-sm text-danger">{errors.source}</p>}
          </fieldset>
        )}

        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <Field
            type="date"
            label={t('food.date')}
            value={spentOn}
            min={period.start}
            max={period.end}
            error={errors.spentOn}
            onChange={(event) => { setSpentOn(event.target.value) }}
          />
          <Field
            label={t('food.note')}
            value={note}
            maxLength={256}
            placeholder={t('food.notePlaceholder')}
            onChange={(event) => { setNote(event.target.value) }}
          />
        </div>

        {failure !== null && <Notice tone="error">{errorText(failure, t)}</Notice>}

        {purchase && (
          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
            {confirmDelete ? (
              <>
                <Button variant="danger" disabled={busy} onClick={() => void run(() => foodApi.deletePurchase(purchase.id))}>
                  <Trash2 />
                  {t('food.confirmDelete')}
                </Button>
                <Button variant="quiet" onClick={() => { setConfirmDelete(false) }}>
                  {t('common.cancel')}
                </Button>
              </>
            ) : (
              <Button variant="quiet" className="text-danger!" onClick={() => { setConfirmDelete(true) }}>
                <Trash2 />
                {t('food.deletePurchase')}
              </Button>
            )}
          </div>
        )}
      </form>
    </Dialog>
  )
}
