import { useEffect, useRef, useState, type SubmitEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { api, errorText } from '../../lib/api.ts'
import { useAuth, type AuthUser } from '../../lib/auth.tsx'
import { useT } from '../../lib/i18n.tsx'
import { Button } from '../../ui/Button.tsx'
import { Notice } from '../../ui/Notice.tsx'
import { Skeleton } from '../../ui/Skeleton.tsx'
import { AuthLayout } from './AuthLayout.tsx'
import { useLinkToken } from './link-token.ts'
import { PasswordField } from './PasswordField.tsx'

/* /verifica-email#token=… — the link from the confirmation email. In the
   browser that registered, confirming signs in and goes straight to the
   budget. In any other browser the server confirms nothing until the
   account's password is entered here (`passwordRequired`), so the owner of
   a mailbox cannot confirm an account someone else created with it. */

interface VerifyAnswer {
  user: AuthUser | null
  passwordRequired?: boolean
}

function BackToSignIn() {
  const t = useT()
  return (
    <p className="mt-6 border-t border-line pt-5 text-center text-sm">
      <Link to="/buget" className="font-semibold text-brand underline-offset-2 hover:underline">
        {t('auth.backToSignIn')}
      </Link>
    </p>
  )
}

export function VerifyEmailPage() {
  const t = useT()
  const token = useLinkToken()
  const { signedIn } = useAuth()
  const navigate = useNavigate()
  // Kept as the error, not its text, so switching language translates it too.
  const [failure, setFailure] = useState<{ error: unknown } | null>(null)
  const [needsPassword, setNeedsPassword] = useState(false)
  const [password, setPassword] = useState('')
  const [passwordFailure, setPasswordFailure] = useState<{ error: unknown } | null>(null)
  const [busy, setBusy] = useState(false)
  // The token works once; StrictMode's second effect run must not spend it again.
  const sent = useRef(false)

  const done = (user: AuthUser) => {
    signedIn(user)
    void navigate('/buget', { replace: true })
  }

  useEffect(() => {
    if (!token || sent.current) return
    sent.current = true
    api<VerifyAnswer>('/api/auth/verify-email', { method: 'POST', body: { token } })
      .then(({ user }) => {
        if (user) {
          signedIn(user)
          void navigate('/buget', { replace: true })
        } else {
          setNeedsPassword(true)
        }
      })
      .catch((error: unknown) => { setFailure({ error }) })
  }, [token, signedIn, navigate])

  const submit = async (event: SubmitEvent) => {
    event.preventDefault()
    setPasswordFailure(null)
    setBusy(true)
    try {
      const { user } = await api<VerifyAnswer>('/api/auth/verify-email', { method: 'POST', body: { token, password } })
      if (!user) throw new Error('verify-email answered without an account')
      done(user)
    } catch (error) {
      setPasswordFailure({ error })
      setBusy(false)
    }
  }

  if (!token || failure) {
    return (
      <AuthLayout title={t('auth.verifyFailedTitle')}>
        <div className="mt-6">
          <Notice tone="error">{failure ? errorText(failure.error, t) : t('auth.linkIncomplete')}</Notice>
        </div>
        <BackToSignIn />
      </AuthLayout>
    )
  }

  if (needsPassword) {
    return (
      <AuthLayout title={t('auth.verifyPasswordTitle')}>
        <form onSubmit={(event) => void submit(event)} className="mt-6 flex flex-col gap-4">
          <p className="text-sm text-muted">{t('auth.verifyPasswordText')}</p>
          <PasswordField
            label={t('auth.password')}
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => { setPassword(event.target.value) }}
          />
          {passwordFailure && <Notice tone="error">{errorText(passwordFailure.error, t)}</Notice>}
          <Button type="submit" disabled={busy || password === ''} className="mt-2 w-full">
            {busy ? t('auth.signingIn') : t('auth.verifyConfirm')}
          </Button>
          <p className="text-sm text-muted">{t('auth.verifyNotYou')}</p>
        </form>
        <BackToSignIn />
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title={t('auth.verifyingTitle')}>
      <div className="mt-6 flex flex-col gap-3" role="status" aria-label={t('auth.verifyingTitle')}>
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    </AuthLayout>
  )
}
