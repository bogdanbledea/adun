import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { App } from '../../App.tsx'
import { testAccount } from '../../test/account.ts'
import { renderWithProviders } from '../../test/render.tsx'
import { fakeServer } from '../../test/server.ts'
import { currentMonthKey, shiftMonth } from '../budget/month-key.ts'
import type { Plan, PlanDetail } from './plans-api.ts'

afterEach(() => {
  vi.unstubAllGlobals()
})

const thisMonth = currentMonthKey()
const query = `?month=${thisMonth}`

const phone: Plan = {
  id: 'p1',
  name: 'Telefon',
  installmentCount: 3,
  totalBani: 200_000,
  installmentBani: 66_666,
  firstMonthKey: shiftMonth(thisMonth, -1),
  categoryName: 'Rate',
  purchaseDate: null,
  closedAt: null,
  createdAt: '2026-10-20T10:00:00.000Z',
  paidInstallments: 2,
  remainingInstallments: 1,
}

const renderApp = (path = '/planuri-de-rate') => renderWithProviders(<App />, { path, withAuth: true })

test('is reached from the account menu', async () => {
  fakeServer({ '/api/user/me': [200, testAccount], [`/api/plans${query}`]: [200, []] })
  renderApp('/setari')

  await userEvent.click(await screen.findByRole('button', { name: 'Meniu cont' }))
  await userEvent.click(screen.getByRole('menuitem', { name: 'Planuri de rate' }))

  expect(await screen.findByRole('heading', { level: 1, name: 'Planuri de rate' })).toBeDefined()
  expect(await screen.findByRole('heading', { name: 'Niciun plan de rate' })).toBeDefined()
})

test('shows each plan with its progress, and its instalments on request', async () => {
  const detail: PlanDetail = {
    ...phone,
    installments: [
      { id: 'e1', index: 1, monthKey: shiftMonth(thisMonth, -1), amountBani: 66_668, paid: true },
      { id: 'e2', index: 2, monthKey: thisMonth, amountBani: 66_666, paid: true },
      { id: 'e3', index: 3, monthKey: shiftMonth(thisMonth, 1), amountBani: 66_666, paid: false },
    ],
  }
  fakeServer({
    '/api/user/me': [200, testAccount],
    [`/api/plans${query}`]: [200, [phone]],
    [`/api/plans/p1${query}`]: [200, detail],
  })
  renderApp()

  const row = (await screen.findByRole('heading', { name: 'Telefon' })).closest('li') as HTMLElement
  expect(within(row).getByText('Activ')).toBeDefined()
  expect(within(row).getByText('2 din 3')).toBeDefined()
  expect(within(row).getByText('1 rămase')).toBeDefined()
  expect(within(row).getByRole('progressbar', { name: 'Rate plătite' }).getAttribute('aria-valuenow')).toBe('2')

  await userEvent.click(within(row).getByRole('button', { name: 'Arată ratele pentru Telefon' }))
  const items = await within(row).findAllByRole('listitem')
  expect(items).toHaveLength(3)
  expect(within(items[1] as HTMLElement).getByText('(luna curentă)')).toBeDefined()
  expect(within(items[2] as HTMLElement).getByText('3')).toBeDefined()
})

test('says when the plans cannot be loaded', async () => {
  fakeServer({ '/api/user/me': [200, testAccount], [`/api/plans${query}`]: [500, { error: { code: 'internal_error', message: 'x' } }] })
  renderApp()

  expect(await screen.findByText(/Planurile nu au putut fi încărcate/)).toBeDefined()
})
