import { Pencil, Plus, Trash2, TrendingDown, TrendingUp } from 'lucide-react'
import { useT } from '../../lib/i18n.tsx'
import { IconButton } from '../../ui/Button.tsx'
import { cx } from '../../ui/cx.ts'
import { Money } from '../../ui/Money.tsx'
import { categoryTotal, type Category, type Entry } from './budget-api.ts'

/* The month's categories with their entries, each category headed by what
   its entries add up to and a button to add to it. The filter hides the
   entries of the other type, and a category left with none. A row opens its
   entry for editing; its edit and delete buttons show on hover with a
   pointer, and always on touch. */

export type Filter = 'all' | 'income' | 'expense'

interface CategoryListProps {
  categories: Category[]
  filter: Filter
  onAdd: (categoryName: string) => void
  onEdit: (entry: Entry, categoryName: string) => void
  onDelete: (entry: Entry) => void
}

const ROW_BUTTON =
  'grid size-11 pointer-fine:size-8 place-items-center rounded-lg text-muted transition-colors duration-150 hover:bg-hover hover:text-ink [&_svg]:size-4'

export function CategoryList({ categories, filter, onAdd, onEdit, onDelete }: CategoryListProps) {
  const t = useT()
  const shown = categories
    .map((category) => ({
      category,
      entries: filter === 'all' ? category.entries : category.entries.filter((entry) => entry.type === filter),
    }))
    .filter(({ entries }) => entries.length > 0)

  return (
    <ul className="divide-y divide-line">
      {shown.map(({ category, entries }) => {
        const Icon = entries[0]?.type === 'expense' ? TrendingDown : TrendingUp
        return (
          <li key={category.id} className="px-2 py-3 sm:px-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-1.5 pl-2">
                <Icon aria-hidden="true" className={cx('size-4 shrink-0', entries[0]?.type === 'expense' ? 'text-expense' : 'text-income')} />
                <h3 className="truncate text-base font-semibold">{category.name}</h3>
                <span className="shrink-0 text-xs text-muted tabular-nums">{entries.length}</span>
              </div>
              <div className="flex shrink-0 items-center">
                <Money bani={categoryTotal({ ...category, entries })} tone="auto" signed className="font-display font-semibold" />
                <IconButton label={t('budget.addToCategory', { name: category.name })} onClick={() => { onAdd(category.name) }}>
                  <Plus />
                </IconButton>
              </div>
            </div>
            <ul className="mt-1 pl-1">
              {entries.map((entry) => (
                <li
                  key={entry.id}
                  onClick={() => { onEdit(entry, category.name) }}
                  className="group flex min-h-11 pointer-fine:min-h-9 cursor-pointer items-center justify-between gap-2 border-t border-line py-1 pr-1 pl-2 first:border-t-0 hover:bg-hover"
                >
                  <span className="min-w-0 flex-1 truncate">{entry.description}</span>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <Money bani={entry.amountBani} tone={entry.type} className="text-right font-semibold sm:min-w-24" />
                    {/* Hidden until hover on pointer devices; always there on touch. */}
                    <div className="flex [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:group-hover:opacity-100">
                      <button
                        type="button"
                        aria-label={t('budget.editEntry', { name: entry.description })}
                        title={t('budget.editEntry', { name: entry.description })}
                        onClick={(event) => {
                          event.stopPropagation()
                          onEdit(entry, category.name)
                        }}
                        className={ROW_BUTTON}
                      >
                        <Pencil />
                      </button>
                      <button
                        type="button"
                        aria-label={t('budget.deleteEntryNamed', { name: entry.description })}
                        title={t('budget.deleteEntryNamed', { name: entry.description })}
                        onClick={(event) => {
                          event.stopPropagation()
                          onDelete(entry)
                        }}
                        className={cx(ROW_BUTTON, 'hover:text-danger')}
                      >
                        <Trash2 />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </li>
        )
      })}
    </ul>
  )
}
