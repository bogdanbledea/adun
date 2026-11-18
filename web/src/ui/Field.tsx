import { useId, type InputHTMLAttributes, type ReactNode } from 'react'
import { cx } from './cx.ts'

/* A labelled input with an optional hint and error. The error is announced
   with the field (aria-describedby) and marks it invalid. */

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  hint?: string
  error?: string
  /** A small control inside the right edge of the input, such as "show password". */
  trailing?: ReactNode
}

export function Field({ label, hint, error, trailing, id, className, ...props }: FieldProps) {
  const generated = useId()
  const fieldId = id ?? generated
  const describedBy = error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined

  const input = (
    <input
      id={fieldId}
      aria-invalid={error ? true : undefined}
      aria-describedby={describedBy}
      className={cx(
        'min-h-11 pointer-fine:min-h-9 w-full rounded-lg border bg-paper px-3 py-2 text-ink placeholder:text-muted/70',
        'transition-colors duration-150 disabled:opacity-60',
        error ? 'border-danger' : 'border-line-strong hover:border-muted',
        trailing ? 'pr-12' : undefined,
        className,
      )}
      {...props}
    />
  )

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={fieldId} className="text-sm font-semibold text-ink">
        {label}
      </label>
      {trailing ? (
        <div className="relative">
          {input}
          <div className="absolute inset-y-0 right-0 flex items-center">{trailing}</div>
        </div>
      ) : (
        input
      )}
      {hint && !error && (
        <p id={`${fieldId}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${fieldId}-error`} className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
