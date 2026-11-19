import { useState } from 'react'
import { useAuth } from '../../lib/auth.tsx'
import { useT } from '../../lib/i18n.tsx'
import { PageHeader } from '../../layout/PageHeader.tsx'
import { FamilySection } from '../family/FamilySection.tsx'
import { AccountSection } from './AccountSection.tsx'
import { ActivitySection } from './ActivitySection.tsx'
import { AppearanceSection } from './AppearanceSection.tsx'
import { DataSection } from './DataSection.tsx'
import { FoodPeriodSection } from './FoodPeriodSection.tsx'
import { PrivacySection } from './PrivacySection.tsx'
import { SecuritySection } from './SecuritySection.tsx'

/* /setari: account, security, privacy, appearance, family, food period and
   my data, with the activity history beside them. The account comes from the
   auth state, which every change here updates. */

export function SettingsPage() {
  const t = useT()
  const { state } = useAuth()
  // Bumped after an export, an import or erasing the history, so the history shows it.
  const [activityKey, setActivityKey] = useState(0)
  if (state.status !== 'signed_in') return null

  return (
    <>
      <PageHeader title={t('settings.title')} subtitle={t('settings.subtitle')} />
      {/* The history has a card of its own, beside the settings on a wide screen. */}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="card">
          <AccountSection user={state.user} />
          <SecuritySection />
          <PrivacySection />
          <AppearanceSection />
          <FamilySection />
          <FoodPeriodSection user={state.user} />
          <DataSection onChanged={() => { setActivityKey((key) => key + 1) }} />
        </div>
        <div className="card">
          <ActivitySection key={activityKey} />
        </div>
      </div>
    </>
  )
}
