import { Eraser, MoreHorizontal, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { errorText } from '../../lib/api.ts'
import { useI18n } from '../../lib/i18n.tsx'
import { ConfirmDialog } from '../../ui/Dialog.tsx'
import { Menu, type MenuEntry } from '../../ui/Menu.tsx'
import { Money } from '../../ui/Money.tsx'
import { Notice } from '../../ui/Notice.tsx'
import { monthLong } from '../budget/month-key.ts'
import { foodApi, type FoodMonth } from './food-api.ts'
import { counted, fill } from './food-format.ts'

/* Two ways out of a month that went wrong, least destructive first: clearing
   the purchases keeps the sources and the period; deleting the budget removes
   all three. Clearing is offered only when there are purchases. */

type Action = 'clear' | 'delete'

export function FoodMonthMenu({ data, onDone }: { data: FoodMonth; onDone: () => void }) {
  const { t, language } = useI18n()
  const [action, setAction] = useState<Action | null>(null)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<unknown>(null)

  const month = monthLong(data.monthKey, language)
  const hasPurchases = data.purchases.length > 0
  const open = (next: Action) => {
    setFailure(null)
    setAction(next)
  }

  const confirm = async () => {
    setBusy(true)
    setFailure(null)
    try {
      if (action === 'clear') await foodApi.clearPurchases(data.monthKey)
      else await foodApi.deleteBudget(data.monthKey)
      setAction(null)
      onDone()
    } catch (error) {
      setFailure(error)
    }
    setBusy(false)
  }

  const items: MenuEntry[] = [
    ...(hasPurchases ? [{ label: t('food.clearPurchases'), icon: <Eraser />, onSelect: () => { open('clear') } }] : []),
    { label: t('food.deleteBudget'), icon: <Trash2 />, tone: 'danger', onSelect: () => { open('delete') } },
  ]

  return (
    <>
      <Menu
        label={t('food.monthOptions')}
        trigger={<MoreHorizontal aria-hidden="true" className="size-5" />}
        triggerClassName="grid size-11 pointer-fine:size-9 place-items-center rounded-lg text-muted hover:bg-hover hover:text-ink"
        items={items}
      />
      <ConfirmDialog
        open={action !== null}
        title={t(action === 'clear' ? 'food.clearTitle' : 'food.deleteTitle', { month })}
        confirmLabel={action === 'clear' ? t('food.clearPurchases') : t('food.deleteBudget')}
        destructive
        busy={busy}
        onConfirm={() => void confirm()}
        onCancel={() => { setAction(null) }}
      >
        <p>{t(action === 'clear' ? 'food.clearText' : 'food.deleteText')}</p>
        <ul className="mt-3 flex flex-col gap-1 border-l-2 border-danger pl-3 text-ink">
          <li>
            {hasPurchases
              ? fill(t('food.worth'), {
                  purchases: counted(t, 'food.count.purchases', data.purchases.length),
                  amount: <Money bani={data.spentBani} />,
                })
              : t('food.noPurchase')}
          </li>
          {action === 'delete' && (
            <li>
              {fill(t('food.sourcesTotal'), {
                sources: counted(t, 'food.count.sources', data.sources.length),
                amount: <Money bani={data.totalBani} />,
              })}
            </li>
          )}
          <li className="text-sm text-muted">{t('food.cannotUndo')}</li>
        </ul>
        {failure !== null && (
          <div className="mt-3">
            <Notice tone="error">{errorText(failure, t)}</Notice>
          </div>
        )}
      </ConfirmDialog>
    </>
  )
}
