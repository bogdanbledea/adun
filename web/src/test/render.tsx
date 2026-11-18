import { render } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'
import { MemoryRouter } from 'react-router'
import { I18nProvider } from '../lib/i18n.tsx'
import { ThemeProvider } from '../lib/theme.tsx'

/** Renders inside the same providers as main.tsx, at the given URL. They wrap
    rerender() too. */
export function renderWithProviders(ui: ReactElement, { path = '/' }: { path?: string } = {}) {
  function Providers({ children }: { children: ReactNode }) {
    return (
      <MemoryRouter initialEntries={[path]}>
        <ThemeProvider>
          <I18nProvider>{children}</I18nProvider>
        </ThemeProvider>
      </MemoryRouter>
    )
  }
  return render(ui, { wrapper: Providers })
}
