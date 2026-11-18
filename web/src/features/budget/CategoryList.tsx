import { useI18n } from '../../lib/i18n.tsx'
import { cx } from '../../ui/cx.ts'
import type { Category, Entry } from './budget-api.ts'
import { formatBani } from './money.ts'

/* The month's categories in order, each a card with its entries. Income is
   marked with a plus and the brand colour; a category's header shows what
   its entries add up to, income and expenses apart. */

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

export function CategoryList({ categories }: { categories: Category[] }) {
  return (
    <div className="space-y-3">
      {categories.map((category) => {
        const income = sumOf(category.entries, 'income')
        const expense = sumOf(category.entries, 'expense')
        return (
          <section key={category.id} aria-label={category.name} className="card overflow-hidden">
            <header className="flex items-baseline justify-between gap-3 border-b border-line bg-hover/40 px-4 py-2.5">
              <h3 className="min-w-0 truncate text-base font-semibold">{category.name}</h3>
              <span className="flex shrink-0 gap-3 text-sm font-semibold">
                {income > 0 && <Amount entry={{ type: 'income', amountBani: income }} />}
                {(expense > 0 || income === 0) && <Amount entry={{ type: 'expense', amountBani: expense }} />}
              </span>
            </header>
            <ul>
              {category.entries.map((entry) => (
                <li key={entry.id} className="flex items-baseline justify-between gap-3 border-t border-line px-4 py-2.5 first:border-t-0">
                  <span className="min-w-0 break-words">{entry.description}</span>
                  <Amount entry={entry} />
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
