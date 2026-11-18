import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'
import { cx } from './cx.ts'

/* A labelled input or select with an optional hint and error. The error is
   announced with the field (aria-describedby) and marks it invalid. */

const controlClass = (error: boolean) =>
  cx(
    'min-h-11 pointer-fine:min-h-9 w-full rounded-lg border bg-paper px-3 py-2 text-ink placeholder:text-muted/70',
    'transition-colors duration-150 disabled:opacity-60',
    error ? 'border-danger' : 'border-line-strong hover:border-muted',
  )

const describedBy = (id: string, hint?: string, error?: string) =>
  error ? `${id}-error` : hint ? `${id}-hint` : undefined

interface FrameProps {
  id: string
  label: string
  hint?: string
  error?: string
  children: ReactNode
}

function FieldFrame({ id, label, hint, error, children }: FrameProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-ink">
        {label}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  )
}

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

  const input = (
    <input
      id={fieldId}
      aria-invalid={error ? true : undefined}
      aria-describedby={describedBy(fieldId, hint, error)}
      className={cx(controlClass(Boolean(error)), trailing ? 'pr-12' : undefined, className)}
      {...props}
    />
  )

  return (
    <FieldFrame id={fieldId} label={label} hint={hint} error={error}>
      {trailing ? (
        <div className="relative">
          {input}
          <div className="absolute inset-y-0 right-0 flex items-center">{trailing}</div>
        </div>
      ) : (
        input
      )}
    </FieldFrame>
  )
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string
  hint?: string
  error?: string
}

export function Select({ label, hint, error, id, className, children, ...props }: SelectProps) {
  const generated = useId()
  const fieldId = id ?? generated
  return (
    <FieldFrame id={fieldId} label={label} hint={hint} error={error}>
      <select
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fieldId, hint, error)}
        className={cx(controlClass(Boolean(error)), className)}
        {...props}
      >
        {children}
      </select>
    </FieldFrame>
  )
}
