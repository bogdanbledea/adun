import { cx } from './cx.ts'

interface ProgressBarProps {
  value: number
  max: number
  /** Accessible name, such as "45% of income spent". */
  label: string
  /** "over" turns the bar red, for spending past what came in. */
  tone?: 'gold' | 'brand' | 'over'
}

const FILLS = { gold: 'bg-gold', brand: 'bg-brand', over: 'bg-danger' } as const

export function ProgressBar({ value, max, label, tone = 'gold' }: ProgressBarProps) {
  const share = max > 0 ? Math.min(Math.max(value / max, 0), 1) : 0
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className="h-2 w-full rounded-full bg-track"
    >
      {/* Set through the DOM style object, which the CSP allows. */}
      <div className={cx('h-full rounded-full transition-[width] duration-300', FILLS[tone])} style={{ width: `${String(share * 100)}%` }} />
    </div>
  )
}
