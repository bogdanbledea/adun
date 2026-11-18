import { useAuth } from '../../lib/auth.tsx'
import { useT } from '../../lib/i18n.tsx'
import { PageHeader } from '../../layout/PageHeader.tsx'
import { AccountSection } from './AccountSection.tsx'
import { ActivitySection } from './ActivitySection.tsx'
import { PasswordSection } from './PasswordSection.tsx'

/* /setari: the account and what can be done with it. The account comes from
   the auth state, which every change here updates. */

export function SettingsPage() {
  const t = useT()
  const { state } = useAuth()
  if (state.status !== 'signed_in') return null

  return (
    <>
      <PageHeader title={t('settings.title')} subtitle={t('settings.subtitle')} />
      <div className="card max-w-3xl">
        <AccountSection user={state.user} />
        <PasswordSection />
        <ActivitySection />
      </div>
    </>
  )
}
