import { useState, type SubmitEvent } from 'react'
import { useNavigate } from 'react-router'
import { ApiError, api, errorText } from '../../lib/api.ts'
import { useAuth, type AuthUser } from '../../lib/auth.tsx'
import { useT, type MessageKey } from '../../lib/i18n.tsx'
import { passwordProblem } from '../../lib/password.ts'
import { Button } from '../../ui/Button.tsx'
import { Notice } from '../../ui/Notice.tsx'
import { AuthLayout, BackToSignIn } from './AuthLayout.tsx'
import { useLinkToken } from './link-token.ts'
import { PasswordField } from './PasswordField.tsx'

/* /parola-noua#token=… — the link from the "forgot password" email. The new
   password signs in here and ends every other session of the account. A link
   that no longer works says so in place of the form, since nothing typed into
   it could succeed. */

interface Problems {
  password?: MessageKey
  confirm?: MessageKey
}

export function ResetPasswordPage() {
  const t = useT()
  const token = useLinkToken()
  const { signedIn } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [problems, setProblems] = useState<Problems>({})
  // Kept as the error, not its text, so switching language translates it too.
  const [failure, setFailure] = useState<{ error: unknown } | null>(null)
  const [linkFailure, setLinkFailure] = useState<{ error: unknown } | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (event: SubmitEvent) => {
    event.preventDefault()
    setFailure(null)
    const found: Problems = {
      password: passwordProblem(password) ?? undefined,
      confirm: password !== confirm ? 'auth.passwordsMismatch' : undefined,
    }
    setProblems(found)
    if (found.password || found.confirm) return

    setBusy(true)
    try {
      const { user } = await api<{ user: AuthUser }>('/api/auth/reset-password', {
        method: 'POST',
        body: { token, password },
      })
      signedIn(user)
      void navigate('/buget', { replace: true })
    } catch (error) {
      if (error instanceof ApiError && error.code === 'invalid_token') setLinkFailure({ error })
      else setFailure({ error })
      setBusy(false)
    }
  }

  if (!token || linkFailure) {
    return (
      <AuthLayout title={t('auth.resetFailedTitle')}>
        <div className="mt-6">
          <Notice tone="error">{linkFailure ? errorText(linkFailure.error, t) : t('auth.linkIncomplete')}</Notice>
        </div>
        <BackToSignIn />
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title={t('auth.resetTitle')}>
      <form onSubmit={(event) => void submit(event)} className="mt-6 flex flex-col gap-4">
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
        {failure && <Notice tone="error">{errorText(failure.error, t)}</Notice>}
        <Button type="submit" disabled={busy} className="mt-2 w-full">
          {busy ? t('auth.saving') : t('auth.resetSave')}
        </Button>
        <p className="text-sm text-muted">{t('auth.resetSessionsNote')}</p>
      </form>
      <BackToSignIn />
    </AuthLayout>
  )
}
