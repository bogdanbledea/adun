import { cx } from './cx.ts'

/* An on/off control (role="switch"). Space and Enter toggle it, as on any
   button. The label is spoken; show the same words next to it. */

interface SwitchProps {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}

export function Switch({ label, checked, onChange, disabled = false }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => { onChange(!checked) }}
      className="grid min-h-11 pointer-fine:min-h-9 shrink-0 place-items-center disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span
        className={cx(
          'relative inline-flex h-6 w-11 items-center rounded-full border transition-colors duration-150',
          checked ? 'border-brand bg-brand' : 'border-line-strong bg-track',
        )}
      >
        <span
          className={cx(
            'inline-block size-4 rounded-full bg-paper shadow-sm transition-transform duration-150 motion-reduce:transition-none',
            checked ? 'translate-x-6' : 'translate-x-1',
          )}
        />
      </span>
    </button>
  )
}
