import { render } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'
import { MemoryRouter } from 'react-router'
import { AuthProvider } from '../lib/auth.tsx'
import { I18nProvider } from '../lib/i18n.tsx'
import { PrivacyProvider } from '../lib/privacy.tsx'
import { ThemeProvider } from '../lib/theme.tsx'

/** Renders inside the same providers as main.tsx, at the given URL. They wrap
    rerender() too. The auth provider asks the server who is signed in, so
    tests that use it stub fetch first (test/server.ts). */
export function renderWithProviders(
  ui: ReactElement,
  { path = '/', withAuth = false }: { path?: string; withAuth?: boolean } = {},
) {
  function Providers({ children }: { children: ReactNode }) {
    return (
      <MemoryRouter initialEntries={[path]}>
        <ThemeProvider>
          <PrivacyProvider>
            <I18nProvider>{withAuth ? <AuthProvider>{children}</AuthProvider> : children}</I18nProvider>
          </PrivacyProvider>
        </ThemeProvider>
      </MemoryRouter>
    )
  }
  return render(ui, { wrapper: Providers })
}
