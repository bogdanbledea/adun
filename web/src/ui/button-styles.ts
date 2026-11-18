import { cx } from './cx.ts'

export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger'

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-on-brand shadow-sm hover:bg-brand-deep hover:text-page',
  secondary: 'border border-brand text-brand hover:bg-hover hover:text-brand-deep',
  quiet: 'text-muted hover:bg-hover hover:text-ink',
  danger: 'bg-danger text-on-danger shadow-sm hover:opacity-90',
}

/* Also used on links that look like buttons (<Link className={buttonClass()}>). */
export function buttonClass(variant: ButtonVariant = 'primary', className?: string): string {
  return cx(
    'inline-flex min-h-11 pointer-fine:min-h-9 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold',
    'transition-[background-color,color,transform] duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100',
    '[&_svg]:size-4 [&_svg]:shrink-0',
    VARIANTS[variant],
    className,
  )
}
