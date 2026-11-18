import { cx } from './cx.ts'

interface ProgressBarProps {
  value: number
  max: number
  /** Accessible name, such as "45% of income spent". */
  label: string
  /** "over" turns the bar red, for spending past what came in. */
  tone?: 'gold' | 'brand' | 'over'
  /** A thin line at this value, such as where spending should be by today. */
  marker?: number
}

const FILLS = { gold: 'bg-gold', brand: 'bg-brand', over: 'bg-danger' } as const

const shareOf = (value: number, max: number) => (max > 0 ? Math.min(Math.max(value / max, 0), 1) : 0)

export function ProgressBar({ value, max, label, tone = 'gold', marker }: ProgressBarProps) {
  const share = shareOf(value, max)
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className="relative h-2 w-full rounded-full bg-track"
    >
      {/* Set through the DOM style object, which the CSP allows. */}
      <div className={cx('h-full rounded-full transition-[width] duration-300', FILLS[tone])} style={{ width: `${String(share * 100)}%` }} />
      {marker !== undefined && (
        <div
          aria-hidden="true"
          className="absolute -top-0.5 h-3 w-0.5 -translate-x-1/2 rounded-full bg-ink/60"
          style={{ left: `${String(shareOf(marker, max) * 100)}%` }}
        />
      )}
    </div>
  )
}
