import { Navigate, Route, Routes } from 'react-router'
import { ResetPasswordPage } from './features/auth/ResetPasswordPage.tsx'
import { SignInPage } from './features/auth/SignInPage.tsx'
import { VerifyEmailPage } from './features/auth/VerifyEmailPage.tsx'
import { PrivacyPage } from './features/privacy/PrivacyPage.tsx'
import { SettingsPage } from './features/settings/SettingsPage.tsx'
import { AppShell } from './layout/AppShell.tsx'
import { NotFound } from './layout/NotFound.tsx'
import { PageHeader } from './layout/PageHeader.tsx'
import { PageLoading } from './layout/PageLoading.tsx'
import { PublicFrame } from './layout/PublicFrame.tsx'
import { useAuth } from './lib/auth.tsx'
import { useT, type MessageKey } from './lib/i18n.tsx'

/* The route table. URLs are Romanian in both languages. Pages are behind
   RequireAuth, which shows the sign-in page in place (keeping the URL) when
   there is no session. The privacy page is open to everyone, inside the shell
   when signed in; the page an email link opens works signed in or out. Each
   section has its page header for now; the features fill them in. */

function RequireAuth() {
  const { state } = useAuth()
  if (state.status === 'loading') return <PageLoading />
  if (state.status === 'signed_out') return <SignInPage />
  return <AppShell />
}

function Privacy() {
  const { state } = useAuth()
  if (state.status === 'loading') return <PageLoading />
  if (state.status === 'signed_out') {
    return (
      <PublicFrame>
        <PrivacyPage />
      </PublicFrame>
    )
  }
  return (
    <AppShell>
      <PrivacyPage />
    </AppShell>
  )
}

// Signed out, the sign-in page asking for a new password; signed in, nothing to do.
function ForgotPassword() {
  const { state } = useAuth()
  if (state.status === 'loading') return <PageLoading />
  if (state.status === 'signed_out') return <SignInPage initialMode="forgot" />
  return <Navigate to="/buget" replace />
}

function Section({ title, subtitle }: { title: MessageKey; subtitle: MessageKey }) {
  const t = useT()
  return <PageHeader title={t(title)} subtitle={t(subtitle)} />
}

export function App() {
  return (
    <Routes>
      <Route path="/confidentialitate" element={<Privacy />} />
      <Route path="/verifica-email" element={<VerifyEmailPage />} />
      <Route path="/parola-noua" element={<ResetPasswordPage />} />
      <Route path="/parola-uitata" element={<ForgotPassword />} />
      <Route element={<RequireAuth />}>
        <Route index element={<Navigate to="/buget" replace />} />
        <Route path="/buget" element={<Section title="nav.budget" subtitle="budget.subtitle" />} />
        <Route path="/mancare" element={<Section title="nav.food" subtitle="food.subtitle" />} />
        <Route path="/scadente" element={<Section title="nav.reminders" subtitle="reminders.subtitle" />} />
        <Route path="/setari" element={<SettingsPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
