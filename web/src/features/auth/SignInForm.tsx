import { useState, type SubmitEvent } from 'react'
import { ApiError, api, errorText } from '../../lib/api.ts'
import { useAuth, type AuthUser } from '../../lib/auth.tsx'
import { useI18n } from '../../lib/i18n.tsx'
import { Button } from '../../ui/Button.tsx'
import { Field } from '../../ui/Field.tsx'
import { Notice } from '../../ui/Notice.tsx'
import { PasswordField } from './PasswordField.tsx'

interface SignInFormProps {
  email: string
  onEmailChange: (email: string) => void
  /** Shown above the form, e.g. after an account was created. */
  notice: string | null
  /** The password was right but the address is not confirmed yet. */
  onNeedsConfirmation: () => void
  onForgotPassword: () => void
}

export function SignInForm({ email, onEmailChange, notice, onNeedsConfirmation, onForgotPassword }: SignInFormProps) {
  const { t, language } = useI18n()
  const { signedIn } = useAuth()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (event: SubmitEvent) => {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      // The language goes along for the emails the server sends on its own, such as reminders.
      const user = await api<AuthUser>('/api/auth/login', { method: 'POST', body: { email, password, language } })
      signedIn(user)
    } catch (err) {
      setBusy(false)
      if (err instanceof ApiError && err.code === 'email_not_verified') {
        onNeedsConfirmation()
        return
      }
      setError(errorText(err, t))
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="mt-6 flex flex-col gap-4">
      {notice && <Notice tone="success">{notice}</Notice>}
      <Field
        label={t('auth.email')}
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(event) => { onEmailChange(event.target.value) }}
      />
      <PasswordField
        label={t('auth.password')}
        autoComplete="current-password"
        required
        value={password}
        onChange={(event) => { setPassword(event.target.value) }}
      />
      <button
        type="button"
        onClick={onForgotPassword}
        className="-mt-2 self-end text-sm font-semibold text-brand underline-offset-2 hover:underline"
      >
        {t('auth.forgotLink')}
      </button>
      {error && <Notice tone="error">{error}</Notice>}
      <Button type="submit" disabled={busy} className="mt-2 w-full">
        {busy ? t('auth.signingIn') : t('auth.signIn')}
      </Button>
    </form>
  )
}
