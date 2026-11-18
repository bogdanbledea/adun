import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useI18n } from '../../lib/i18n.tsx'
import { cx } from '../../ui/cx.ts'
import { monthKeyToParam, monthShort } from './month-key.ts'

/* A row of month pills on a track, scrolled so the selected one sits in the
   middle, between arrows to the month before and after. The edges fade, so
   it is clear there are more months either side. Months that have a budget
   carry a dot. */

const arrowClass =
  'grid size-10 shrink-0 place-items-center rounded-full text-muted transition-colors duration-150 hover:bg-paper hover:text-ink pointer-fine:size-8 [&_svg]:size-4'

interface MonthStripProps {
  months: string[]
  selected: string
  withBudget: ReadonlySet<string>
  currentYear: string
}

export function MonthStrip({ months, selected, withBudget, currentYear }: MonthStripProps) {
  const { t, language } = useI18n()
  const stripRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef<HTMLAnchorElement>(null)
  const centered = useRef(false)

  useLayoutEffect(() => {
    const strip = stripRef.current
    const active = activeRef.current
    if (!strip || !active) return
    const target = active.offsetLeft - (strip.clientWidth - active.offsetWidth) / 2
    // Jump on first render, glide afterwards (reduced motion turns this off in CSS).
    strip.scrollTo({ left: Math.max(0, target), behavior: centered.current ? 'smooth' : 'auto' })
    centered.current = true
  }, [selected])

  const index = months.indexOf(selected)
  const arrow = (to: string | undefined, label: string, icon: ReactNode) =>
    to ? (
      <Link to={`/buget/${monthKeyToParam(to)}`} replace aria-label={label} title={label} className={arrowClass}>
        {icon}
      </Link>
    ) : (
      <span aria-hidden="true" className={cx(arrowClass, 'opacity-30')}>
        {icon}
      </span>
    )

  return (
    <nav aria-label={t('budget.selectMonth')} className="flex min-w-0 flex-1 items-center gap-1 rounded-full bg-track p-1">
      {arrow(months[index - 1], t('budget.previousMonth'), <ChevronLeft aria-hidden="true" />)}
      <div
        ref={stripRef}
        className="relative flex min-w-0 flex-1 gap-0.5 overflow-x-auto [scrollbar-width:none] [mask-image:linear-gradient(to_right,transparent,black_1.5rem,black_calc(100%-1.5rem),transparent)]"
      >
        {months.map((monthKey) => {
          const active = monthKey === selected
          return (
            <Link
              key={monthKey}
              ref={active ? activeRef : undefined}
              to={`/buget/${monthKeyToParam(monthKey)}`}
              replace
              aria-current={active ? 'page' : undefined}
              className={cx(
                'relative flex min-h-10 shrink-0 items-center rounded-full px-3.5 text-sm whitespace-nowrap transition-colors duration-150 pointer-fine:min-h-8',
                active ? 'bg-paper font-semibold text-ink shadow-sm' : 'text-muted hover:text-ink',
              )}
            >
              {monthShort(monthKey, language, currentYear)}
              {withBudget.has(monthKey) && (
                <>
                  <span className="sr-only">{t('budget.hasBudget')}</span>
                  {!active && <span aria-hidden="true" className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-brand/70" />}
                </>
              )}
            </Link>
          )
        })}
      </div>
      {arrow(months[index + 1], t('budget.nextMonth'), <ChevronRight aria-hidden="true" />)}
    </nav>
  )
}
