import { BellRing, LogOut, MonitorSmartphone, Moon, Settings, ShieldCheck, Sun, UtensilsCrossed, Wallet } from 'lucide-react'
import type { ReactNode } from 'react'
import { Outlet, useNavigate } from 'react-router'
import { useAuth, type AuthUser } from '../lib/auth.tsx'
import { useI18n } from '../lib/i18n.tsx'
import { useTheme } from '../lib/theme.tsx'
import { IconButton } from '../ui/Button.tsx'
import { Menu } from '../ui/Menu.tsx'
import { Tabs } from '../ui/Tabs.tsx'
import { Brand } from './Brand.tsx'
import { Footer } from './Footer.tsx'

/* The frame around every signed-in page: the brand, the three section tabs
   and the controls (theme, language, account menu) in one row on wide
   screens, the tabs on a row of their own below on narrow ones; then the
   page, then the footer. The page is the matched route, or `children` when
   given. */

function initialsFor({ displayName, email }: AuthUser): string {
  const words = displayName.trim().split(/\s+/).filter(Boolean)
  if (words.length >= 2) return `${words[0]?.[0] ?? ''}${words[1]?.[0] ?? ''}`.toUpperCase()
  if (words.length === 1) return (words[0] ?? '').slice(0, 2).toUpperCase()
  return (email.split('@')[0] ?? '').slice(0, 2).toUpperCase()
}

export function AppShell({ children }: { children?: ReactNode }) {
  const { t, toggleLanguage } = useI18n()
  const { theme, toggleTheme } = useTheme()
  const { state, signOut, signOutEverywhere } = useAuth()
  const navigate = useNavigate()
  const user = state.status === 'signed_in' ? state.user : null

  return (
    <div className="flex min-h-dvh flex-col overflow-x-clip bg-page text-ink">
      <header className="sticky top-0 z-40 border-b border-line bg-page/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 px-4 sm:px-6 lg:flex-nowrap">
          <div className="py-2">
            <Brand />
          </div>
          <div className="order-last -mx-4 w-[calc(100%+2rem)] sm:mx-0 sm:w-full lg:order-none lg:w-auto lg:self-end">
            <Tabs
              label={t('nav.sections')}
              tabs={[
                { to: '/buget', label: t('nav.budget'), icon: <Wallet /> },
                { to: '/mancare', label: t('nav.food'), icon: <UtensilsCrossed /> },
                { to: '/scadente', label: t('nav.reminders'), icon: <BellRing /> },
              ]}
            />
          </div>
          <div className="ml-auto flex shrink-0 items-center py-2">
            <IconButton label={theme === 'dark' ? t('theme.toLight') : t('theme.toDark')} onClick={toggleTheme}>
              {theme === 'dark' ? <Sun /> : <Moon />}
            </IconButton>
            <IconButton label={t('language.switch')} onClick={toggleLanguage} className="w-auto px-2.5 text-xs font-semibold">
              {t('language.short')}
            </IconButton>
            {user && (
              <Menu
                label={t('nav.accountMenu')}
                trigger={initialsFor(user)}
                triggerClassName="ml-1 grid size-9 place-items-center rounded-full bg-brand text-xs font-semibold text-on-brand transition-colors duration-150 hover:bg-brand-deep hover:text-page"
                items={[
                  { label: t('nav.settings'), icon: <Settings />, onSelect: () => void navigate('/setari') },
                  { label: t('nav.privacy'), icon: <ShieldCheck />, onSelect: () => void navigate('/confidentialitate') },
                  'separator',
                  {
                    label: t('nav.signOutEverywhere'),
                    icon: <MonitorSmartphone />,
                    onSelect: () => { signOutEverywhere().catch(console.error) },
                  },
                  { label: t('nav.signOut'), icon: <LogOut />, onSelect: () => void signOut(), tone: 'danger' },
                ]}
              />
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 sm:px-6 sm:py-6">
        {children ?? <Outlet />}
      </main>
      <Footer />
    </div>
  )
}
