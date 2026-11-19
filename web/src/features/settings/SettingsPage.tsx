import { useState } from 'react'
import { useAuth } from '../../lib/auth.tsx'
import { useT } from '../../lib/i18n.tsx'
import { PageHeader } from '../../layout/PageHeader.tsx'
import { FamilySection } from '../family/FamilySection.tsx'
import { AccountSection } from './AccountSection.tsx'
import { ActivitySection } from './ActivitySection.tsx'
import { DataSection } from './DataSection.tsx'
import { DeleteAccountSection } from './DeleteAccountSection.tsx'
import { FoodPeriodSection } from './FoodPeriodSection.tsx'
import { PasswordSection } from './PasswordSection.tsx'

/* /setari: the account, its data and what can be done with them. The account
   comes from the auth state, which every change here updates. */

export function SettingsPage() {
  const t = useT()
  const { state } = useAuth()
  // Bumped after an export or import, so the history shows it.
  const [activityKey, setActivityKey] = useState(0)
  if (state.status !== 'signed_in') return null

  return (
    <>
      <PageHeader title={t('settings.title')} subtitle={t('settings.subtitle')} />
      <div className="card max-w-3xl">
        <AccountSection user={state.user} />
        <PasswordSection />
        <FamilySection />
        <FoodPeriodSection user={state.user} />
        <ActivitySection key={activityKey} />
        <DataSection onChanged={() => { setActivityKey((key) => key + 1) }} />
        <DeleteAccountSection />
      </div>
    </>
  )
}
