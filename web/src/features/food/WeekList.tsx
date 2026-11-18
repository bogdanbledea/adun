import { useI18n } from '../../lib/i18n.tsx'
import { cx } from '../../ui/cx.ts'
import { Money } from '../../ui/Money.tsx'
import type { FoodWeek } from './food-api.ts'
import { counted, fill, formatRange, percent } from './food-format.ts'

/* The month's weeks with their allowance and what happened in each. Picking
   a week filters the purchases below; picking it again shows them all. A
   week before the budget was set up has no allowance, so what was spent in
   it does not fill its bar. */

interface WeekListProps {
  weeks: FoodWeek[]
  selected: number | null
  onSelect: (index: number | null) => void
}

export function WeekList({ weeks, selected, onSelect }: WeekListProps) {
  const { t } = useI18n()
  return (
    <section aria-labelledby="food-weeks">
      <h2 id="food-weeks" className="mb-2 font-sans text-sm font-semibold text-muted">
        {t('food.weeks')}
      </h2>
      <ul className="grid gap-2 sm:grid-cols-2">
        {weeks.map((week) => (
          <WeekRow
            key={week.index}
            week={week}
            selected={selected === week.index}
            onSelect={() => { onSelect(selected === week.index ? null : week.index) }}
          />
        ))}
      </ul>
    </section>
  )
}

function WeekRow({ week, selected, onSelect }: { week: FoodWeek; selected: boolean; onSelect: () => void }) {
  const { t, language } = useI18n()
  const over = !week.beforeStart && week.remainingBani < 0
  const current = week.state === 'current'
  const spent = <Money bani={week.spentBani} />

  let caption
  if (week.beforeStart) {
    caption = week.spentBani > 0 ? fill(t('food.week.beforeStartSpent'), { amount: spent }) : t('food.week.beforeStart')
  } else if (week.state === 'future') {
    caption =
      week.spentBani > 0
        ? fill(t('food.week.futureSpent'), { amount: spent })
        : t(week.estimated ? 'food.week.estimated' : 'food.week.upcoming')
  } else if (over) {
    caption = fill(t('food.week.overBy'), { amount: <Money bani={-week.remainingBani} tone="expense" /> })
  } else {
    caption = fill(t(week.state === 'past' ? 'food.week.pastLeft' : 'food.week.currentLeft'), {
      spent,
      left: <Money bani={week.remainingBani} tone={week.state === 'past' ? 'income' : 'plain'} />,
    })
  }

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        title={t('food.weekShow', { index: week.index })}
        className={cx(
          'w-full rounded-xl border bg-paper px-3 py-2.5 text-left shadow-card transition-colors duration-150 hover:bg-hover',
          selected ? 'border-brand bg-hover' : current ? 'border-brand/60' : 'border-line',
          week.state === 'past' && !selected && 'text-ink/85',
        )}
      >
        <span className="flex items-baseline justify-between gap-3">
          <span className="text-sm">
            <span className="font-semibold">{t('food.weekLabel', { index: week.index })}</span>
            <span className="text-muted"> · {formatRange(week.start, week.end, language)}</span>
            {week.days < 7 && <span className="text-xs text-muted"> · {counted(t, 'food.count.days', week.days)}</span>}
          </span>
          <Money bani={week.allowanceBani} className="text-sm font-semibold" />
        </span>
        {/* A bare bar: the caption below says the same in words. */}
        <span aria-hidden="true" className="mt-2 block h-2 overflow-hidden rounded-full bg-track">
          <span
            className={cx('block h-full rounded-full', over ? 'bg-danger' : week.state === 'past' ? 'bg-brand' : 'bg-gold')}
            style={{ width: `${String(week.beforeStart ? 0 : percent(week.spentBani, week.allowanceBani))}%` }}
          />
        </span>
        <span className="mt-1.5 block text-xs text-muted">{caption}</span>
      </button>
    </li>
  )
}
