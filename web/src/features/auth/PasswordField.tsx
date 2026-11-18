import { Eye, EyeOff } from 'lucide-react'
import { useState, type InputHTMLAttributes } from 'react'
import { useT } from '../../lib/i18n.tsx'
import { Field } from '../../ui/Field.tsx'

interface PasswordFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string
  hint?: string
  error?: string
}

/** A password input with a button that shows what was typed. */
export function PasswordField(props: PasswordFieldProps) {
  const t = useT()
  const [revealed, setRevealed] = useState(false)
  const label = revealed ? t('auth.hidePassword') : t('auth.showPassword')
  return (
    <Field
      {...props}
      type={revealed ? 'text' : 'password'}
      trailing={
        <button
          type="button"
          onClick={() => { setRevealed((shown) => !shown) }}
          aria-label={label}
          title={label}
          className="grid size-11 pointer-fine:size-9 place-items-center rounded-lg text-muted transition-colors duration-150 hover:text-ink [&_svg]:size-4"
        >
          {revealed ? <EyeOff /> : <Eye />}
        </button>
      }
    />
  )
}
