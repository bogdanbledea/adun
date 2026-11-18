import { CircleCheck } from 'lucide-react'
import { useT } from '../../lib/i18n.tsx'
import { AuthLayout } from './AuthLayout.tsx'
import { SignInForm } from './SignInForm.tsx'

/* Shown in place of any signed-in page when there is no session, keeping the
   URL, so signing in lands exactly where the user was going. */

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

export function SignInPage() {
  const t = useT()
  return (
    <AuthLayout title={t('auth.signInTitle')} aside={<Hero />}>
      <SignInForm />
    </AuthLayout>
  )
}
