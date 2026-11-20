import { Copy, Download, LayoutTemplate } from 'lucide-react'
import { useState } from 'react'
import { useI18n } from '../../lib/i18n.tsx'
import { Button } from '../../ui/Button.tsx'
import { buttonClass } from '../../ui/button-styles.ts'
import { Menu, type MenuEntry } from '../../ui/Menu.tsx'
import { budgetApi, type Source } from './budget-api.ts'
import { monthLong } from './month-key.ts'

/* "Import" on a month: appends the entries of the previous month or of the
   template (whichever exist) to this month's categories. Shown only when
   there is something to import from. */

interface ImportMenuProps {
  monthKey: string
  /** The month before, when it has a budget. */
  previousMonth: string | null
  hasTemplate: boolean
  onImported: (count: number) => void
  onFailed: (error: unknown) => void
}

const TRIGGER = 'min-h-9 w-full px-3 py-1.5 sm:w-auto'

export function ImportMenu({ monthKey, previousMonth, hasTemplate, onImported, onFailed }: ImportMenuProps) {
  const { t, language } = useI18n()
  const [importing, setImporting] = useState(false)

  const importFrom = async (from: Source) => {
    setImporting(true)
    try {
      const { imported } = await budgetApi.importInto(monthKey, from)
      onImported(imported)
    } catch (error) {
      onFailed(error)
    }
    setImporting(false)
  }

  const items: MenuEntry[] = []
  if (previousMonth) {
    items.push({
      label: t('budget.importFrom', { month: monthLong(previousMonth, language) }),
      icon: <Copy />,
      onSelect: () => void importFrom(previousMonth),
    })
  }
  if (hasTemplate) {
    items.push({ label: t('budget.importFromTemplate'), icon: <LayoutTemplate />, onSelect: () => void importFrom('template') })
  }
  if (items.length === 0) return null

  if (importing) {
    return (
      <Button variant="secondary" className={TRIGGER} disabled>
        <Download />
        {t('budget.importing')}
      </Button>
    )
  }
  return (
    <Menu
      label={t('budget.importLabel')}
      trigger={
        <>
          <Download />
          {t('budget.import')}
        </>
      }
      triggerClassName={buttonClass('secondary', TRIGGER)}
      items={items}
    />
  )
}
