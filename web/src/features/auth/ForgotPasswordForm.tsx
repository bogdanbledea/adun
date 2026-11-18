import { useState, type SubmitEvent } from 'react'
import { api, errorText } from '../../lib/api.ts'
import { useI18n } from '../../lib/i18n.tsx'
import { Button } from '../../ui/Button.tsx'
import { Field } from '../../ui/Field.tsx'
import { Notice } from '../../ui/Notice.tsx'

/* Asks for a link to choose a new password. The server answers the same
   whether or not the address has an account, so "sent" follows either way.
   With email off there is no link to send, and the form says so instead. */

interface ForgotPasswordFormProps {
  emailEnabled: boolean
  email: string
  onEmailChange: (email: string) => void
  onSent: () => void
}

export function ForgotPasswordForm({ emailEnabled, email, onEmailChange, onSent }: ForgotPasswordFormProps) {
  const { t, language } = useI18n()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!emailEnabled) {
    return (
      <div className="mt-6 border-y border-line py-5">
        <p className="font-semibold">{t('auth.forgotNoEmailTitle')}</p>
        <p className="mt-2 text-sm text-muted">{t('auth.forgotNoEmailText')}</p>
      </div>
    )
  }

  const submit = async (event: SubmitEvent) => {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await api('/api/auth/forgot-password', { method: 'POST', body: { email, language } })
      onSent()
    } catch (err) {
      setError(errorText(err, t))
      setBusy(false)
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="mt-6 flex flex-col gap-4">
      <p className="text-sm text-muted">{t('auth.forgotText')}</p>
      <Field
        label={t('auth.email')}
        type="email"
        autoComplete="email"
        required
        maxLength={320}
        value={email}
        onChange={(event) => { onEmailChange(event.target.value) }}
      />
      {error && <Notice tone="error">{error}</Notice>}
      <Button type="submit" disabled={busy} className="mt-2 w-full">
        {busy ? t('auth.sending') : t('auth.sendResetLink')}
      </Button>
    </form>
  )
}
