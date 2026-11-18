import type { ButtonHTMLAttributes } from 'react'
import { buttonClass, type ButtonVariant } from './button-styles.ts'
import { cx } from './cx.ts'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
}

export function Button({ variant = 'primary', type = 'button', className, ...props }: ButtonProps) {
  return <button type={type} className={buttonClass(variant, className)} {...props} />
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Spoken and shown on hover; an icon button has no visible text. */
  label: string
}

export function IconButton({ label, type = 'button', className, ...props }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cx(
        'grid size-11 pointer-fine:size-9 shrink-0 place-items-center rounded-lg text-muted',
        'transition-colors duration-150 hover:bg-hover hover:text-ink [&_svg]:size-[18px]',
        className,
      )}
      {...props}
    />
  )
}
