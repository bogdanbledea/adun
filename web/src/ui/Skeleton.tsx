import { cx } from './cx.ts'

/** A placeholder block while data loads; size it with className. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cx('animate-pulse rounded-lg bg-track', className)} />
}
