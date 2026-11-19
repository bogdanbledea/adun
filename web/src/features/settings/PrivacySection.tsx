import { Link } from 'react-router'
import { useT } from '../../lib/i18n.tsx'
import { SettingsSection } from './SettingsSection.tsx'

/* Where to read what the app keeps. Hiding amounts is the eye in the header,
   remembered on this device, so there is no switch for it here. */

export function PrivacySection() {
  const t = useT()
  return (
    <SettingsSection title={t('settings.privacy')}>
      <p className="text-sm text-muted">
        <Link to="/confidentialitate" className="font-semibold text-brand underline underline-offset-2 hover:text-brand-deep">
          {t('settings.appPrivacyLink')}
        </Link>
      </p>
    </SettingsSection>
  )
}
