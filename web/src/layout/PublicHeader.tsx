import { Moon, Sun } from 'lucide-react'
import { useI18n } from '../lib/i18n.tsx'
import { useTheme } from '../lib/theme.tsx'
import { IconButton } from '../ui/Button.tsx'
import { Brand } from './Brand.tsx'

/** The header of pages seen signed out: the brand, the theme and language controls. */
export function PublicHeader() {
  const { t, toggleLanguage } = useI18n()
  const { theme, toggleTheme } = useTheme()
  return (
    <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-2 px-4 pt-2 sm:px-6 sm:pt-3">
      <Brand withMotto />
      <div className="flex shrink-0 items-center">
        <IconButton label={theme === 'dark' ? t('theme.toLight') : t('theme.toDark')} onClick={toggleTheme}>
          {theme === 'dark' ? <Sun /> : <Moon />}
        </IconButton>
        <IconButton label={t('language.switch')} onClick={toggleLanguage} className="w-auto px-2.5 text-xs font-semibold">
          {t('language.short')}
        </IconButton>
      </div>
    </header>
  )
}
