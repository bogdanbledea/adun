import { CircleCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api } from '../../lib/api.ts'
import { useT } from '../../lib/i18n.tsx'
import { AuthLayout } from './AuthLayout.tsx'
import { MailSent } from './MailSent.tsx'
import { SignInForm } from './SignInForm.tsx'
import { SignUpForm } from './SignUpForm.tsx'

/* Shown in place of any signed-in page when there is no session, keeping the
   URL, so signing in lands exactly where the user was going. Sign-in,
   sign-up and "check your email" are modes of this one page. */

interface AuthStatus {
  registrationsEnabled: boolean
  emailEnabled: boolean
}

function useAuthStatus(): AuthStatus | null {
  const [status, setStatus] = useState<AuthStatus | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    api<AuthStatus>('/api/auth/status', { signal: controller.signal })
      .then(setStatus)
      .catch(() => {
        // Offer sign-up anyway; the server refuses it if registrations are off.
        if (!controller.signal.aborted) setStatus({ registrationsEnabled: true, emailEnabled: false })
      })
    return () => { controller.abort() }
  }, [])
  return status
}

function Hero() {
  const t = useT()
  return (
    <aside className="hidden lg:block">
      <p className="text-sm font-semibold text-brand">{t('auth.kicker')}</p>
      <p className="font-display mt-6 max-w-xl text-5xl leading-[1.02] font-semibold tracking-[-0.05em] text-brand-deep">
        {t('auth.heroTitle')}
      </p>
      <p className="mt-6 max-w-md text-lg leading-relaxed text-muted">{t('auth.heroText')}</p>
      <ul className="mt-8 divide-y divide-line border-y border-line text-sm">
        {[t('auth.featureBudget'), t('auth.featureFood'), t('auth.featureReminders')].map((item) => (
          <li key={item} className="flex items-center gap-3 py-3">
            <CircleCheck className="size-4 shrink-0 text-brand" aria-hidden="true" />
            {item}
          </li>
        ))}
      </ul>
    </aside>
  )
}

function SwitchLine({ question, action, onClick }: { question: string; action: string; onClick: () => void }) {
  return (
    <p className="mt-6 border-t border-line pt-5 text-center text-sm text-muted">
      {question}{' '}
      <button type="button" onClick={onClick} className="font-semibold text-brand underline-offset-2 hover:underline">
        {action}
      </button>
    </p>
  )
}

export function SignInPage() {
  const t = useT()
  const status = useAuthStatus()
  const registrationsEnabled = status?.registrationsEnabled ?? null
  const [mode, setMode] = useState<'signin' | 'signup' | 'check-email'>('signin')
  const [email, setEmail] = useState('')
  const [notice, setNotice] = useState<string | null>(null)

  if (mode === 'check-email') {
    return (
      <AuthLayout title={t('auth.checkEmailTitle')} aside={<Hero />}>
        <MailSent text={t('auth.checkEmailText', { email })} />
        <SwitchLine question="" action={t('auth.backToSignIn')} onClick={() => { setMode('signin') }} />
      </AuthLayout>
    )
  }

  if (mode === 'signup') {
    return (
      <AuthLayout title={t('auth.signUpTitle')} aside={<Hero />}>
        {registrationsEnabled === false ? (
          <div className="mt-6 border-y border-line py-5">
            <p className="font-semibold">{t('auth.registrationsClosed')}</p>
            <p className="mt-2 text-sm text-muted">{t('auth.registrationsClosedText')}</p>
          </div>
        ) : (
          <SignUpForm
            email={email}
            onEmailChange={setEmail}
            onRegistered={() => {
              if (status?.emailEnabled) {
                setMode('check-email')
                return
              }
              setNotice(t('auth.accountReady'))
              setMode('signin')
            }}
          />
        )}
        <SwitchLine question={t('auth.haveAccount')} action={t('auth.signIn')} onClick={() => { setMode('signin') }} />
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title={t('auth.signInTitle')} aside={<Hero />}>
      <SignInForm
        email={email}
        onEmailChange={setEmail}
        notice={notice}
        onNeedsConfirmation={() => {
          setNotice(null)
          setMode('check-email')
        }}
      />
      {registrationsEnabled === true && (
        <SwitchLine
          question={t('auth.noAccount')}
          action={t('auth.register')}
          onClick={() => {
            setNotice(null)
            setMode('signup')
          }}
        />
      )}
      {registrationsEnabled === false && (
        <p className="mt-6 border-t border-line pt-5 text-center text-sm text-muted">{t('auth.registrationsClosed')}</p>
      )}
    </AuthLayout>
  )
}
