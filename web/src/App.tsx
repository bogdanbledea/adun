import { Navigate, Route, Routes } from 'react-router'
import { SignInPage } from './features/auth/SignInPage.tsx'
import { AppShell } from './layout/AppShell.tsx'
import { NotFound } from './layout/NotFound.tsx'
import { PageHeader } from './layout/PageHeader.tsx'
import { PageLoading } from './layout/PageLoading.tsx'
import { useAuth } from './lib/auth.tsx'
import { useT, type MessageKey } from './lib/i18n.tsx'

/* The route table. URLs are Romanian in both languages. Every page is behind
   RequireAuth, which shows the sign-in page in place (keeping the URL) when
   there is no session. Each section has its page header for now; the
   features fill them in. */

function RequireAuth() {
  const { state } = useAuth()
  if (state.status === 'loading') return <PageLoading />
  if (state.status === 'signed_out') return <SignInPage />
  return <AppShell />
}

function Section({ title, subtitle }: { title: MessageKey; subtitle: MessageKey }) {
  const t = useT()
  return <PageHeader title={t(title)} subtitle={t(subtitle)} />
}

export function App() {
  return (
    <Routes>
      <Route element={<RequireAuth />}>
        <Route index element={<Navigate to="/buget" replace />} />
        <Route path="/buget" element={<Section title="nav.budget" subtitle="budget.subtitle" />} />
        <Route path="/mancare" element={<Section title="nav.food" subtitle="food.subtitle" />} />
        <Route path="/scadente" element={<Section title="nav.reminders" subtitle="reminders.subtitle" />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
