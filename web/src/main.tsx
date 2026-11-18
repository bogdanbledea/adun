import '@fontsource-variable/manrope'
import '@fontsource-variable/source-sans-3'
import './styles/base.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { App } from './App.tsx'
import { AuthProvider } from './lib/auth.tsx'
import { I18nProvider } from './lib/i18n.tsx'
import { PrivacyProvider } from './lib/privacy.tsx'
import { ThemeProvider } from './lib/theme.tsx'

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <PrivacyProvider>
          <I18nProvider>
            <AuthProvider>
              <App />
            </AuthProvider>
          </I18nProvider>
        </PrivacyProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
)
