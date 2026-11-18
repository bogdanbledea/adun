import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { App } from '../../App.tsx'
import { testAccount } from '../../test/account.ts'
import { renderWithProviders } from '../../test/render.tsx'
import { fakeServer, sentBody } from '../../test/server.ts'
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

test('a new plan shows its split and is sent in bani', async () => {
  let reads = 0
  const fetchMock = fakeServer({
    '/api/user/me': [200, testAccount],
    [`GET /api/plans${query}`]: () =>
      Promise.resolve(new Response(JSON.stringify(reads++ === 0 ? [] : [phone]), { status: 200 })),
    [`POST /api/plans${query}`]: [201, phone],
  })
  renderApp()

  await userEvent.click(await screen.findByRole('button', { name: 'Adaugă primul plan' }))
  const dialog = screen.getByRole('dialog', { name: 'Plan nou de plată în rate' })
  await userEvent.click(within(dialog).getByRole('button', { name: 'Creează planul' }))
  expect(within(dialog).getByText('Scrie numele produsului.')).toBeDefined()
  expect(within(dialog).getByText('Scrie un număr de rate între 1 și 360.')).toBeDefined()

  await userEvent.type(within(dialog).getByLabelText('Numele produsului'), 'Telefon')
  await userEvent.type(within(dialog).getByLabelText('Valoare totală (lei)'), '2000')
  await userEvent.type(within(dialog).getByLabelText('Număr de rate'), '3')
  expect(within(dialog).getByRole('status').textContent).toMatch(/Prima rată 666,68.*apoi 666,66/)
  await userEvent.click(within(dialog).getByRole('button', { name: 'Creează planul' }))

  expect(await screen.findByRole('heading', { name: 'Telefon' })).toBeDefined()
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(sentBody(fetchMock, `/api/plans${query}`)).toEqual({
    name: 'Telefon',
    totalBani: 200_000,
    installmentCount: 3,
    firstMonthKey: thisMonth,
    categoryName: 'Rate',
    purchaseDate: null,
  })
})

test('an open plan is closed, and a closed one deleted, after asking', async () => {
  const closed = { ...phone, closedAt: '2026-11-18T10:00:00.000Z', remainingInstallments: 0 }
  const answers = [[phone], [closed], []]
  const fetchMock = fakeServer({
    '/api/user/me': [200, testAccount],
    [`GET /api/plans${query}`]: () => Promise.resolve(new Response(JSON.stringify(answers.shift()), { status: 200 })),
    [`POST /api/plans/p1/close${query}`]: [200, closed],
    'DELETE /api/plans/p1': [200, { ok: true }],
  })
  renderApp()

  await userEvent.click(await screen.findByRole('button', { name: 'Închide planul' }))
  const closeDialog = screen.getByRole('dialog', { name: 'Închide planul „Telefon”' })
  expect(within(closeDialog).getByText(/Se șterg 1 rate viitoare/)).toBeDefined()
  await userEvent.click(within(closeDialog).getByRole('button', { name: 'Închide planul' }))

  expect(await screen.findByText('Închis')).toBeDefined()
  await userEvent.click(screen.getByRole('button', { name: 'Șterge definitiv' }))
  const deleteDialog = screen.getByRole('dialog', { name: 'Șterge definitiv planul „Telefon”' })
  await userEvent.click(within(deleteDialog).getByRole('button', { name: 'Șterge definitiv' }))

  expect(await screen.findByRole('heading', { name: 'Niciun plan de rate' })).toBeDefined()
  expect(fetchMock.mock.calls.some(([path, init]) => path === '/api/plans/p1' && init?.method === 'DELETE')).toBe(true)
})

test('the purchase date is added in place', async () => {
  const fetchMock = fakeServer({
    '/api/user/me': [200, testAccount],
    [`GET /api/plans${query}`]: [200, [phone]],
    [`PATCH /api/plans/p1${query}`]: [200, { ...phone, purchaseDate: '2026-10-20' }],
  })
  renderApp()

  await userEvent.click(await screen.findByRole('button', { name: '+ Adaugă data achiziției' }))
  await userEvent.type(screen.getByLabelText('Data achiziției'), '2026-10-20')
  await userEvent.click(screen.getByRole('button', { name: 'Salvează' }))

  expect(await screen.findByText('Data achiziției: 20 octombrie 2026')).toBeDefined()
  expect(sentBody(fetchMock, `/api/plans/p1${query}`)).toEqual({ purchaseDate: '2026-10-20' })
})
