import { Monitor, Moon, Sun } from 'lucide-react'
import type { ReactNode } from 'react'
import { useT } from '../../lib/i18n.tsx'
import { useTheme, type ThemePreference } from '../../lib/theme.tsx'
import { segmentClass, segmentGroup } from '../../ui/segmented.ts'
import { SettingRow, SettingsSection } from './SettingsSection.tsx'

/* The theme, kept on this device. "System" follows the device's setting;
   the button in the header picks light or dark. */

export function AppearanceSection() {
  const t = useT()
  const { preference, setPreference } = useTheme()
  const options: { value: ThemePreference; label: string; icon: ReactNode }[] = [
    { value: 'system', label: t('settings.themeSystem'), icon: <Monitor /> },
    { value: 'light', label: t('settings.themeLight'), icon: <Sun /> },
    { value: 'dark', label: t('settings.themeDark'), icon: <Moon /> },
  ]

  return (
    <SettingsSection title={t('settings.appearance')}>
      <SettingRow title={t('settings.theme')} description={t('settings.themeText')}>
        <fieldset className={segmentGroup}>
          <legend className="sr-only">{t('settings.theme')}</legend>
          {options.map((option) => (
            <label key={option.value} className={segmentClass(preference === option.value)}>
              <input
                type="radio"
                name="theme"
                value={option.value}
                checked={preference === option.value}
                onChange={() => { setPreference(option.value) }}
                className="sr-only"
              />
              {option.icon}
              {option.label}
            </label>
          ))}
        </fieldset>
      </SettingRow>
    </SettingsSection>
  )
}
