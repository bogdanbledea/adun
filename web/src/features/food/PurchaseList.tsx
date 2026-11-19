import { Bike, Plus, ShoppingCart, X } from 'lucide-react'
import { useI18n } from '../../lib/i18n.tsx'
import { Button } from '../../ui/Button.tsx'
import { Money } from '../../ui/Money.tsx'
import type { FoodPurchase } from './food-api.ts'
import { formatWeekday, isDelivery } from './food-format.ts'

/* The month's purchases, newest day first, grouped by day with the day's
   total. A row opens the purchase for editing. The source shows when there
   is more than one. */

interface PurchaseListProps {
  purchases: FoodPurchase[]
  /** The week the list is filtered to, if any. */
  week: number | null
  showSource: boolean
  onClearWeek: () => void
  onAdd: () => void
  onOpen: (purchase: FoodPurchase) => void
}

function byDay(purchases: FoodPurchase[]) {
  const days: { date: string; items: FoodPurchase[] }[] = []
  for (const purchase of purchases) {
    const last = days.at(-1)
    if (last?.date === purchase.spentOn) last.items.push(purchase)
    else days.push({ date: purchase.spentOn, items: [purchase] })
  }
  return days
}

export function PurchaseList({ purchases, week, showSource, onClearWeek, onAdd, onOpen }: PurchaseListProps) {
  const { t, language } = useI18n()
  return (
    <section aria-labelledby="food-purchases">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 id="food-purchases" className="font-sans text-sm font-semibold text-muted">
            {t('food.purchases')}
          </h2>
          {week !== null && (
            <button
              type="button"
              onClick={onClearWeek}
              aria-label={t('food.clearFilter')}
              title={t('food.clearFilter')}
              className="inline-flex min-h-8 items-center gap-1 rounded-full border border-brand px-2.5 text-xs font-semibold text-brand hover:bg-hover"
            >
              {t('food.weekLabel', { index: week })}
              <X aria-hidden="true" className="size-3.5" />
            </button>
          )}
        </div>
        <Button variant="secondary" onClick={onAdd}>
          <Plus />
          {t('food.add')}
        </Button>
      </div>

      {purchases.length === 0 ? (
        <div className="card px-6 py-10 text-center">
          <p className="text-muted">{week === null ? t('food.noPurchases') : t('food.noWeekPurchases')}</p>
          {week === null && (
            <Button className="mt-4" onClick={onAdd}>
              <Plus />
              {t('food.addFirst')}
            </Button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {byDay(purchases).map((day) => (
            <div key={day.date}>
              <h3 className="mb-1.5 flex items-baseline justify-between px-1 font-sans text-xs font-semibold text-muted">
                <span>{formatWeekday(day.date, language)}</span>
                <Money bani={day.items.reduce((sum, p) => sum + p.amountBani, 0)} tone="muted" />
              </h3>
              <ul className="divide-y divide-line overflow-hidden card">
                {day.items.map((purchase) => {
                  const Icon = isDelivery(purchase.merchant) ? Bike : ShoppingCart
                  const details = [showSource ? purchase.sourceName : null, purchase.note].filter(Boolean).join(' · ')
                  return (
                    <li key={purchase.id}>
                      <button
                        type="button"
                        onClick={() => { onOpen(purchase) }}
                        title={t('food.editPurchase')}
                        className="flex min-h-14 w-full items-center gap-3 px-3 py-2.5 text-left transition-colors duration-150 hover:bg-hover"
                      >
                        <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-lg bg-track text-muted">
                          <Icon className="size-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold">{purchase.merchant}</span>
                          {details && <span className="block truncate text-xs text-muted">{details}</span>}
                        </span>
                        <Money bani={purchase.amountBani} className="font-semibold" />
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
