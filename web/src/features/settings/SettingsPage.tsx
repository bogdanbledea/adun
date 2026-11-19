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
      {/* The history has a card of its own, beside the settings on a wide screen. */}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="card">
          <AccountSection user={state.user} />
          <PasswordSection />
          <FamilySection />
          <FoodPeriodSection user={state.user} />
          <DataSection onChanged={() => { setActivityKey((key) => key + 1) }} />
          <DeleteAccountSection />
        </div>
        <div className="card">
          <ActivitySection key={activityKey} />
        </div>
      </div>
    </>
  )
}
