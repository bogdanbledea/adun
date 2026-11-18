import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useLayoutEffect, useRef } from 'react'
import { Link } from 'react-router'
import { useI18n } from '../../lib/i18n.tsx'
import { cx } from '../../ui/cx.ts'
import { monthShort, monthsOfYear, shiftMonth } from './month-key.ts'

/* The twelve months of the selected month's year as pills between arrows to
   the month before and after. On a narrow screen the pills scroll sideways,
   with the selected one brought into view. Months with a budget carry a dot. */

const arrowClass =
  'grid size-11 shrink-0 place-items-center rounded-full text-muted transition-colors duration-150 hover:bg-hover hover:text-ink pointer-fine:size-9 [&_svg]:size-4'

export function MonthStrip({ selected, withBudget }: { selected: string; withBudget: ReadonlySet<string> }) {
  const { t, language } = useI18n()
  const stripRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef<HTMLAnchorElement>(null)

  useLayoutEffect(() => {
    const strip = stripRef.current
    const active = activeRef.current
    if (!strip || !active) return
    strip.scrollLeft = Math.max(0, active.offsetLeft - (strip.clientWidth - active.offsetWidth) / 2)
  }, [selected])

  return (
    <nav aria-label={t('budget.months')} className="mb-5 flex items-center gap-1">
      <Link to={`/buget/${shiftMonth(selected, -1)}`} aria-label={t('budget.previousMonth')} title={t('budget.previousMonth')} className={arrowClass}>
        <ChevronLeft />
      </Link>
      <div ref={stripRef} className="flex min-w-0 flex-1 gap-1 overflow-x-auto rounded-full bg-track p-1 [scrollbar-width:none]">
        {monthsOfYear(selected).map((monthKey) => {
          const active = monthKey === selected
          const short = monthShort(monthKey, language)
          const hasBudget = withBudget.has(monthKey)
          return (
            <Link
              key={monthKey}
              ref={active ? activeRef : undefined}
              to={`/buget/${monthKey}`}
              aria-current={active ? 'page' : undefined}
              aria-label={hasBudget ? `${short}, ${t('budget.hasBudget')}` : undefined}
              className={cx(
                'relative flex min-h-9 min-w-12 flex-1 items-center justify-center rounded-full px-3 text-sm font-semibold transition-colors duration-150',
                active ? 'bg-paper text-brand-deep shadow-sm' : 'text-muted hover:text-ink',
              )}
            >
              {short}
              {hasBudget && <span aria-hidden="true" className="absolute bottom-1 size-1 rounded-full bg-brand" />}
            </Link>
          )
        })}
      </div>
      <Link to={`/buget/${shiftMonth(selected, 1)}`} aria-label={t('budget.nextMonth')} title={t('budget.nextMonth')} className={arrowClass}>
        <ChevronRight />
      </Link>
    </nav>
  )
}
