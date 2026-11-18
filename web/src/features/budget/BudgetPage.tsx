import { useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { PageHeader } from '../../layout/PageHeader.tsx'
import { NotFound } from '../../layout/NotFound.tsx'
import { useT } from '../../lib/i18n.tsx'
import { budgetApi } from './budget-api.ts'
import { currentMonthKey, isMonthKey } from './month-key.ts'
import { MonthStrip } from './MonthStrip.tsx'
import { MonthView } from './MonthView.tsx'

/* /buget shows this month, /buget/2026-11 any other. The list of months with
   a budget only marks the strip, so the page works while it loads, and if it
   fails the strip simply has no dots. */

export function BudgetPage() {
  const t = useT()
  const { month } = useParams()
  const monthKey = month ?? currentMonthKey()
  const [withBudget, setWithBudget] = useState<ReadonlySet<string>>(new Set())

  useEffect(() => {
    const controller = new AbortController()
    budgetApi
      .months(controller.signal)
      .then((keys) => { setWithBudget(new Set(keys)) })
      .catch(() => undefined)
    return () => { controller.abort() }
  }, [])

  if (!isMonthKey(monthKey)) return <NotFound />

  const mark = (key: string, has: boolean) => {
    setWithBudget((current) => {
      const next = new Set(current)
      if (has) next.add(key)
      else next.delete(key)
      return next
    })
  }

  return (
    <>
      <PageHeader title={t('nav.budget')} subtitle={t('budget.subtitle')} />
      <MonthStrip selected={monthKey} withBudget={withBudget} />
      <MonthView key={monthKey} monthKey={monthKey} onHasBudget={(has) => { mark(monthKey, has) }} />
    </>
  )
}
