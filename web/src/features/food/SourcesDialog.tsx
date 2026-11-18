import { CalendarDays, Plus, RotateCcw, X } from 'lucide-react'
import { useId, useState, type SubmitEvent } from 'react'
import { errorText } from '../../lib/api.ts'
import { useI18n } from '../../lib/i18n.tsx'
import { baniToInput, parseAmount } from '../../lib/money.ts'
import { Button, IconButton } from '../../ui/Button.tsx'
import { Dialog } from '../../ui/Dialog.tsx'
import { Money } from '../../ui/Money.tsx'
import { Notice } from '../../ui/Notice.tsx'
import { dayLong, dayShort, monthLong, monthName, shiftMonth } from '../budget/month-key.ts'
import { foodApi, type FoodMonth, type FoodMonthData, type SourceInput } from './food-api.ts'
import { sameName } from './food-format.ts'

/* The month's money as a list of sources, and when it starts. Saving the
   first time creates the budget, filled in with the latest earlier month's
   sources. The start can move between the 15th of last month and the 28th
   of this one, and back to the rule's date in one tap; the server refuses a
   start that crosses a neighbouring month or leaves a purchase outside. */

const MAX_SOURCES = 10
const MAX_BANI = 100_000_000

interface Row {
  key: number
  id?: string
  name: string
  amount: string
}

let nextKey = 0
const row = (fields: Omit<Row, 'key'>): Row => ({ key: nextKey++, ...fields })

interface SourcesDialogProps {
  data: FoodMonthData
  onClose: () => void
  onSaved: (month: FoodMonth) => void
}

export function SourcesDialog({ data, onClose, onSaved }: SourcesDialogProps) {
  const { t, language } = useI18n()
  const formId = useId()
  const [rows, setRows] = useState<Row[]>(() => {
    const text = (bani: number) => baniToInput(bani, language)
    if (data.exists) return data.sources.map((s) => row({ id: s.id, name: s.name, amount: text(s.amountBani) }))
    if (data.suggestedSources.length > 0) return data.suggestedSources.map((s) => row({ name: s.name, amount: text(s.amountBani) }))
    return [row({ name: '', amount: '' })]
  })
  const [periodStart, setPeriodStart] = useState(data.period.start)
  const [problem, setProblem] = useState<string | null>(null)
  const [failure, setFailure] = useState<unknown>(null)
  const [saving, setSaving] = useState(false)

  const { period, monthKey } = data
  const minStart = `${shiftMonth(monthKey, -1)}-15`
  const maxStart = [`${monthKey}-28`, period.end].sort()[0]
  const total = rows.reduce((sum, r) => sum + (parseAmount(r.amount) ?? 0), 0)
  const presets = ['Revolut', t('food.presetCash'), t('food.presetVouchers')].filter(
    (name) => !rows.some((r) => sameName(r.name, name)),
  )

  const update = (key: number, changes: Partial<Row>) => {
    setRows((current) => current.map((r) => (r.key === key ? { ...r, ...changes } : r)))
  }
  const addRow = (name = '') => {
    setRows((current) => {
      // A preset tapped while the only row is still blank fills that row.
      const only = current.length === 1 ? current[0] : undefined
      if (name && only && !only.id && !only.name && !only.amount) return [row({ name, amount: '' })]
      return [...current, row({ name, amount: '' })]
    })
  }

  const submit = async (event: SubmitEvent) => {
    event.preventDefault()
    const filled = rows.filter((r) => r.id || r.name.trim() || r.amount.trim())
    if (filled.length === 0) {
      setProblem(t('food.needSource'))
      return
    }
    const sources: SourceInput[] = []
    for (const r of filled) {
      const amountBani = parseAmount(r.amount)
      if (!r.name.trim() || amountBani === null || amountBani > MAX_BANI) {
        setProblem(t('food.sourceIncomplete'))
        return
      }
      sources.push({ ...(r.id ? { id: r.id } : {}), name: r.name.trim(), amountBani })
    }
    setProblem(null)
    setFailure(null)
    setSaving(true)
    try {
      onSaved(await foodApi.saveSources(monthKey, sources, periodStart !== period.start ? periodStart : undefined))
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
      title={data.exists ? t('food.moneyTitle') : t('food.newBudgetTitle', { month: monthLong(monthKey, language) })}
      footer={
        <>
          <Button variant="quiet" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form={formId} disabled={saving}>
            {saving ? t('common.saving') : t('common.save')}
          </Button>
        </>
      }
    >
      <form id={formId} noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
        <p className="-mt-1 text-sm text-muted">{t('food.sourcesText', { month: monthName(monthKey, language) })}</p>

        <div className="rounded-lg border border-line p-3">
          <label className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            <CalendarDays aria-hidden="true" className="size-4 text-muted" />
            {t('food.coveredFrom')}
            <input
              type="date"
              value={periodStart}
              min={minStart}
              max={maxStart}
              onChange={(event) => { setPeriodStart(event.target.value) }}
              className="min-h-11 pointer-fine:min-h-9 min-w-0 flex-1 rounded-lg card px-3 font-normal"
            />
          </label>
          <p className="mt-2 text-sm text-muted">
            {t('food.until', { date: dayLong(period.end, language) })}
            {period.rule === 'working_day' && periodStart === period.ruleStart && ` ${t('food.fromPayday')}`}
          </p>
          {periodStart !== period.ruleStart && (
            <Button variant="quiet" className="mt-1 -ml-3 px-3" onClick={() => { setPeriodStart(period.ruleStart) }}>
              <RotateCcw />
              {t(period.rule === 'working_day' ? 'food.backToPayday' : 'food.backToFirst', {
                date: dayShort(period.ruleStart, language),
              })}
            </Button>
          )}
        </div>

        <ul className="flex flex-col gap-2">
          {rows.map((r, i) => (
            <li key={r.key} className="flex items-center gap-2">
              <input
                aria-label={t('food.sourceName', { number: i + 1 })}
                value={r.name}
                maxLength={64}
                placeholder="Revolut"
                onChange={(event) => { update(r.key, { name: event.target.value }) }}
                className="min-h-11 pointer-fine:min-h-9 min-w-0 flex-1 rounded-lg card px-3"
              />
              <input
                aria-label={t('food.sourceAmount', { number: i + 1 })}
                value={r.amount}
                inputMode="decimal"
                placeholder="0"
                onChange={(event) => { update(r.key, { amount: event.target.value }) }}
                className="min-h-11 pointer-fine:min-h-9 w-28 shrink-0 rounded-lg card px-3 text-right tabular-nums"
              />
              <IconButton
                label={t('food.removeSource', { number: i + 1 })}
                disabled={rows.length === 1}
                onClick={() => { setRows((current) => current.filter((x) => x.key !== r.key)) }}
                className="disabled:opacity-40"
              >
                <X />
              </IconButton>
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap gap-1.5">
          <Button variant="secondary" disabled={rows.length >= MAX_SOURCES} onClick={() => { addRow() }}>
            <Plus />
            {t('food.addSource')}
          </Button>
          {presets.map((name) => (
            <Button
              key={name}
              variant="quiet"
              aria-label={t('food.addPreset', { name })}
              disabled={rows.length >= MAX_SOURCES}
              onClick={() => { addRow(name) }}
            >
              <Plus />
              {name}
            </Button>
          ))}
        </div>

        <p className="flex items-baseline justify-between rounded-lg bg-track px-3.5 py-3">
          <span className="text-sm text-muted">{t('food.total')}</span>
          <Money bani={total} className="font-display text-xl font-semibold" />
        </p>

        {problem && <p className="text-sm text-danger">{problem}</p>}
        {failure !== null && <Notice tone="error">{errorText(failure, t)}</Notice>}
      </form>
    </Dialog>
  )
}
