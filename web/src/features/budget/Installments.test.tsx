import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { App } from '../../App.tsx'
import { testAccount } from '../../test/account.ts'
import { renderWithProviders } from '../../test/render.tsx'
import { fakeServer } from '../../test/server.ts'
import type { PlanDetail } from '../plans/plans-api.ts'
import type { Month } from './budget-api.ts'

// "Today" is 18 November 2026.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 18, 12))
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const phonePlan = { id: 'p1', name: 'Telefon', index: 2, total: 3 }

const december: Month = {
  monthKey: '2026-12',
  categories: [
    {
      id: 'c1',
      name: 'Rate',
      entries: [
        { id: 'e1', description: 'Telefon', type: 'expense', amountBani: 66_666, paymentDate: null, plan: phonePlan },
        { id: 'e2', description: 'Bicicletă', type: 'expense', amountBani: 30_000, paymentDate: null, plan: null },
      ],
    },
  ],
  totals: { incomeBani: 0, expenseBani: 96_666, balanceBani: -96_666 },
}

const detail: PlanDetail = {
  id: 'p1',
  name: 'Telefon',
  installmentCount: 3,
  totalBani: 200_000,
  installmentBani: 66_666,
  firstMonthKey: '2026-11',
  categoryName: 'Rate',
  purchaseDate: null,
  closedAt: null,
  createdAt: '2026-11-01T10:00:00.000Z',
  paidInstallments: 1,
  remainingInstallments: 2,
  installments: [],
}

const withDecember = (extra: Parameters<typeof fakeServer>[0] = {}) =>
  fakeServer({
    '/api/user/me': [200, testAccount],
    '/api/months': [200, ['2026-12']],
    'GET /api/months/2026-12': [200, december],
    '/api/plans/p1?month=2026-11': [200, detail],
    ...extra,
  })

const renderApp = () => renderWithProviders(<App />, { path: '/buget/12-26', withAuth: true })

test('an instalment shows its number and opens its plan, from where it can be edited', async () => {
  withDecember()
  renderApp()

  const badge = await screen.findByRole('button', { name: /Rata 2\/3 din planul „Telefon”/ })
  expect(badge.textContent).toBe('2/3')
  await userEvent.click(badge)

  const dialog = screen.getByRole('dialog', { name: 'Plan de plată în rate' })
  expect(await within(dialog).findByText('1 din 3')).toBeDefined()
  expect(within(dialog).getByRole('button', { name: 'Toate planurile' })).toBeDefined()
  await userEvent.click(within(dialog).getByRole('button', { name: 'Editează rata' }))

  const edit = screen.getByRole('dialog', { name: 'Editează tranzacția' })
  expect(within(edit).getByText('Rata 2/3 din planul „Telefon”')).toBeDefined()
  expect(within(edit).getByText('Ratele urmează planul de plată și nu pot fi mutate în altă lună.')).toBeDefined()
  expect(within(edit).queryByRole('combobox', { name: 'Luna' })).toBeNull()
  // An instalment stays an expense.
  expect(within(edit).getByLabelText<HTMLSelectElement>('Tip').disabled).toBe(true)
})

test('deleting a month with instalments clears it and says why it stays', async () => {
  withDecember({ 'DELETE /api/months/2026-12': [200, { ok: true, cleared: true, keptInstallments: 1 }] })
  renderApp()

  await userEvent.click(await screen.findByRole('button', { name: 'Acțiuni pentru lună' }))
  await userEvent.click(screen.getByRole('menuitem', { name: 'Șterge luna' }))
  const dialog = screen.getByRole('dialog', { name: 'Șterge luna: Decembrie 2026' })
  expect(within(dialog).getByText(/Se șterg cele 1 tranzacții proprii/)).toBeDefined()
  expect(within(dialog).getByText(/1 rate din planuri de plată nu se șterg/)).toBeDefined()
  await userEvent.click(within(dialog).getByRole('button', { name: 'Șterge tranzacțiile' }))

  expect(await screen.findByText(/Tranzacțiile proprii au fost șterse/)).toBeDefined()
  expect(screen.getByRole('link', { name: 'Planuri de rate' }).getAttribute('href')).toBe('/planuri-de-rate')
})
