import { Navigate, Route, Routes } from 'react-router'
import { AppShell } from './layout/AppShell.tsx'
import { NotFound } from './layout/NotFound.tsx'
import { PageHeader } from './layout/PageHeader.tsx'
import { useT, type MessageKey } from './lib/i18n.tsx'

/* The route table. URLs are Romanian in both languages. Each section has its
   page header for now; the features fill them in. */

function Section({ title, subtitle }: { title: MessageKey; subtitle: MessageKey }) {
  const t = useT()
  return <PageHeader title={t(title)} subtitle={t(subtitle)} />
}

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/buget" replace />} />
        <Route path="/buget" element={<Section title="nav.budget" subtitle="budget.subtitle" />} />
        <Route path="/mancare" element={<Section title="nav.food" subtitle="food.subtitle" />} />
        <Route path="/scadente" element={<Section title="nav.reminders" subtitle="reminders.subtitle" />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
