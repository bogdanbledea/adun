import { useState, type SubmitEvent } from 'react'
import { Link } from 'react-router'
import { api, errorText } from '../../lib/api.ts'
import { useI18n, type MessageKey } from '../../lib/i18n.tsx'
import { passwordProblem } from '../../lib/password.ts'
import { Button } from '../../ui/Button.tsx'
import { Field } from '../../ui/Field.tsx'
import { Notice } from '../../ui/Notice.tsx'
import { PasswordField } from './PasswordField.tsx'

/* The server answers the same whether or not the address already had an
   account, so success here only means "the request was accepted". */

interface SignUpFormProps {
  email: string
  onEmailChange: (email: string) => void
  onRegistered: () => void
}

interface Problems {
  password?: MessageKey
  confirm?: MessageKey
}

export function SignUpForm({ email, onEmailChange, onRegistered }: SignUpFormProps) {
  const { t, language } = useI18n()
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [problems, setProblems] = useState<Problems>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (event: SubmitEvent) => {
    event.preventDefault()
    setError(null)
    const found: Problems = {
      password: passwordProblem(password) ?? undefined,
      confirm: password !== confirm ? 'auth.passwordsMismatch' : undefined,
    }
    setProblems(found)
    if (found.password || found.confirm) return

    setBusy(true)
    try {
      // The language goes along so the confirmation email is written in it.
      await api('/api/auth/register', { method: 'POST', body: { email, password, displayName, language } })
      onRegistered()
    } catch (err) {
      setError(errorText(err, t))
      setBusy(false)
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="mt-6 flex flex-col gap-4">
      <Field
        label={t('auth.name')}
        autoComplete="name"
        required
        maxLength={256}
        value={displayName}
        onChange={(event) => { setDisplayName(event.target.value) }}
      />
      <Field
        label={t('auth.email')}
        type="email"
        autoComplete="email"
        required
        maxLength={320}
        value={email}
        onChange={(event) => { onEmailChange(event.target.value) }}
      />
      <PasswordField
        label={t('auth.newPassword')}
        hint={t('auth.newPasswordHint')}
        autoComplete="new-password"
        required
        value={password}
        error={problems.password && t(problems.password)}
        onChange={(event) => { setPassword(event.target.value) }}
      />
      <PasswordField
        label={t('auth.confirmPassword')}
        autoComplete="new-password"
        required
        value={confirm}
        error={problems.confirm && t(problems.confirm)}
        onChange={(event) => { setConfirm(event.target.value) }}
      />
      {error && <Notice tone="error">{error}</Notice>}
      <Button type="submit" disabled={busy} className="mt-2 w-full">
        {busy ? t('auth.creatingAccount') : t('auth.createAccount')}
      </Button>
      <p className="text-center text-sm text-muted">
        {/* A new tab, so what is typed here stays. */}
        <Link
          to="/confidentialitate"
          target="_blank"
          rel="noreferrer"
          className="underline-offset-2 hover:text-ink hover:underline"
        >
          {t('auth.whatIsKept')}
        </Link>
      </p>
    </form>
  )
}
