import { Plus } from 'lucide-react'
import type { ReactNode } from 'react'
import { useI18n } from '../../lib/i18n.tsx'
import { IconButton } from '../../ui/Button.tsx'
import { cx } from '../../ui/cx.ts'
import type { Category, Entry } from './budget-api.ts'
import { formatBani } from './money.ts'

/* The month's categories in order, each a card with its entries. Income is
   marked with a plus and the brand colour; a category's header shows what
   its entries add up to, income and expenses apart, and a button to add to
   it. An entry opens for editing in its place. */

function Amount({ entry }: { entry: Pick<Entry, 'type' | 'amountBani'> }) {
  const { language } = useI18n()
  const income = entry.type === 'income'
  return (
    <span className={cx('shrink-0 tabular-nums', income ? 'text-brand' : 'text-ink')}>
      {income ? '+' : ''}
      {formatBani(entry.amountBani, language)}
    </span>
  )
}

function sumOf(entries: Entry[], type: Entry['type']): number {
  return entries.filter((entry) => entry.type === type).reduce((sum, entry) => sum + entry.amountBani, 0)
}

interface CategoryListProps {
  categories: Category[]
  /** The entry being edited, shown as `editor` instead of its row. */
  editingId: string | null
  editor: ReactNode
  onAdd: (categoryName: string) => void
  onEdit: (entry: Entry, categoryName: string) => void
}

export function CategoryList({ categories, editingId, editor, onAdd, onEdit }: CategoryListProps) {
  const { t } = useI18n()
  return (
    <div className="space-y-3">
      {categories.map((category) => {
        const income = sumOf(category.entries, 'income')
        const expense = sumOf(category.entries, 'expense')
        return (
          <section key={category.id} aria-label={category.name} className="card overflow-hidden">
            <header className="flex items-center gap-2 border-b border-line bg-hover/40 py-1 pr-1 pl-4">
              <h3 className="min-w-0 flex-1 truncate text-base font-semibold">{category.name}</h3>
              <span className="flex shrink-0 gap-3 text-sm font-semibold">
                {income > 0 && <Amount entry={{ type: 'income', amountBani: income }} />}
                {(expense > 0 || income === 0) && <Amount entry={{ type: 'expense', amountBani: expense }} />}
              </span>
              <IconButton label={t('budget.addTo', { category: category.name })} onClick={() => { onAdd(category.name) }}>
                <Plus />
              </IconButton>
            </header>
            <ul>
              {category.entries.map((entry) => (
                <li key={entry.id} className="border-t border-line first:border-t-0">
                  {entry.id === editingId ? (
                    editor
                  ) : (
                    <button
                      type="button"
                      onClick={() => { onEdit(entry, category.name) }}
                      className="flex min-h-11 w-full items-baseline justify-between gap-3 px-4 py-2.5 text-left transition-colors duration-150 hover:bg-hover focus-visible:outline-offset-[-2px]"
                    >
                      <span className="min-w-0 break-words">{entry.description}</span>
                      <Amount entry={entry} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
