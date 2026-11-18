import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { App } from '../../App.tsx'
import { testAccount } from '../../test/account.ts'
import { renderWithProviders } from '../../test/render.tsx'
import { fakeServer, sentBody } from '../../test/server.ts'
import type { Month } from './budget-api.ts'

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 18, 12))
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const json = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status }))

const before: Month = {
  monthKey: '2026-12',
  categories: [{ id: 'c1', name: 'Casă', entries: [{ id: 'e1', description: 'Chirie', type: 'expense', amountBani: 150_000, paymentDate: null, plan: null }] }],
  totals: { incomeBani: 0, expenseBani: 150_000, balanceBani: -150_000 },
}
const after: Month = {
  monthKey: '2026-12',
  categories: [
    ...before.categories,
    { id: 'c2', name: 'Alimente', entries: [{ id: 'e2', description: 'Piață', type: 'expense', amountBani: 8550, paymentDate: null, plan: null }] },
  ],
  totals: { incomeBani: 0, expenseBani: 158_550, balanceBani: -158_550 },
}
const saved = { id: 'e2', monthKey: '2026-12', categoryName: 'Alimente', description: 'Piață', type: 'expense', amountBani: 8550, paymentDate: null, plan: null }

// The month as it was, then as it is after the change.
function server(routes: Parameters<typeof fakeServer>[0] = {}) {
  let reads = 0
  return fakeServer({
    '/api/user/me': [200, testAccount],
    '/api/months': [200, ['2026-12']],
    'GET /api/months/2026-12': () => json(200, reads++ === 0 ? before : after),
    ...routes,
  })
}

const renderApp = () => renderWithProviders(<App />, { path: '/buget/12-26', withAuth: true })

async function openQuickAdd() {
  await userEvent.click(await screen.findByRole('button', { name: 'Adaugă cheltuială rapidă' }))
  return screen.getByRole('dialog', { name: 'Adaugă cheltuială rapidă' })
}

async function fill(dialog: HTMLElement, { description = 'Piață', amount = '85,50', category = 'Alimente' } = {}) {
  if (description) await userEvent.type(within(dialog).getByLabelText('Descriere'), description)
  if (amount) await userEvent.type(within(dialog).getByLabelText('Sumă (lei)'), amount)
  if (category) await userEvent.click(within(dialog).getByRole('button', { name: category }))
}

test('the floating button adds an expense to the month on screen, which is then shown as stored', async () => {
  const fetchMock = server({ 'POST /api/entries': [201, saved] })
  renderApp()

  const dialog = await openQuickAdd()
  expect(within(dialog).getByRole('button', { name: 'Decembrie 2026' }).getAttribute('aria-pressed')).toBe('true')
  expect(within(dialog).getByRole('button', { name: 'Ianuarie 2027' }).getAttribute('aria-pressed')).toBe('false')
  expect(within(dialog).getByRole('button', { name: 'Februarie 2027' })).toBeDefined()
  // A few common categories first, then the month's own.
  const offered = within(within(dialog).getByRole('group', { name: 'Categorie' })).getAllByRole('button')
  expect(offered.map((button) => button.textContent)).toEqual(['Alimente', 'Transport', 'Locuință', 'Divertisment', 'Altele', 'Casă'])

  await fill(dialog)
  await userEvent.click(within(dialog).getByRole('button', { name: 'Adaugă cheltuiala' }))

  expect(await screen.findByText('Piață')).toBeDefined()
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(sentBody(fetchMock, '/api/entries')).toEqual({
    monthKey: '2026-12',
    categoryName: 'Alimente',
    description: 'Piață',
    type: 'expense',
    amountBani: 8550,
    paymentDate: null,
  })
})

test('a later month without a budget is started first, and the strip shows it has one', async () => {
  const fetchMock = server({
    'POST /api/months': [201, { monthKey: '2027-02', categories: [], totals: { incomeBani: 0, expenseBani: 0, balanceBani: 0 } }],
    'POST /api/entries': [201, { ...saved, monthKey: '2027-02' }],
  })
  renderApp()

  const dialog = await openQuickAdd()
  await userEvent.click(within(dialog).getByRole('button', { name: 'Februarie 2027' }))
  await fill(dialog)
  await userEvent.click(within(dialog).getByRole('button', { name: 'Adaugă cheltuiala' }))

  const strip = screen.getByRole('navigation', { name: 'Selectează luna' })
  expect(await within(strip).findByRole('link', { name: "Feb '27, are buget" })).toBeDefined()
  expect(sentBody(fetchMock, '/api/months')).toEqual({ monthKey: '2027-02' })
  expect(sentBody(fetchMock, '/api/entries')).toMatchObject({ monthKey: '2027-02' })
  // The month on screen did not change, so it is not read again.
  expect(fetchMock.mock.calls.filter(([path]) => path === '/api/months/2026-12')).toHaveLength(1)
})

test('a month started meanwhile, in another tab, still gets the expense', async () => {
  const fetchMock = server({
    'POST /api/months': [409, { error: { code: 'month_exists', message: 'This month already has a budget.' } }],
    'POST /api/entries': [201, { ...saved, monthKey: '2027-01' }],
  })
  renderApp()

  const dialog = await openQuickAdd()
  await userEvent.click(within(dialog).getByRole('button', { name: 'Ianuarie 2027' }))
  await fill(dialog)
  await userEvent.click(within(dialog).getByRole('button', { name: 'Adaugă cheltuiala' }))

  await vi.waitFor(() => { expect(screen.queryByRole('dialog')).toBeNull() })
  expect(sentBody(fetchMock, '/api/entries')).toMatchObject({ monthKey: '2027-01' })
})

test('says what is missing, and sends nothing', async () => {
  const fetchMock = server()
  renderApp()

  const dialog = await openQuickAdd()
  await fill(dialog, { description: '', amount: 'zece', category: '' })
  await userEvent.click(within(dialog).getByRole('button', { name: 'Adaugă cheltuiala' }))

  expect(within(dialog).getByText('Scrie o descriere.')).toBeDefined()
  expect(within(dialog).getByText('Scrie o sumă între 0 și 9.999.999.999, cu cel mult două zecimale.')).toBeDefined()
  expect(within(dialog).getByText('Alege sau scrie o categorie.')).toBeDefined()
  expect(fetchMock.mock.calls.some(([path]) => path === '/api/entries')).toBe(false)
})

test('a failure stays in the dialog, with what was typed', async () => {
  server({ 'POST /api/entries': [400, { error: { code: 'limit_reached', message: 'Too many entries.' } }] })
  renderApp()

  const dialog = await openQuickAdd()
  await fill(dialog)
  await userEvent.click(within(dialog).getByRole('button', { name: 'Adaugă cheltuiala' }))

  expect(await within(dialog).findByRole('alert')).toBeDefined()
  expect(within(dialog).getByLabelText('Descriere')).toHaveProperty('value', 'Piață')
})

test('sends the payment date when one is chosen', async () => {
  const fetchMock = server({ 'POST /api/entries': [201, saved] })
  renderApp()

  const dialog = await openQuickAdd()
  await fill(dialog)
  await userEvent.type(within(dialog).getByLabelText('Data plății'), '2027-01-05')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Adaugă cheltuiala' }))

  await screen.findByText('Piață')
  expect(sentBody(fetchMock, '/api/entries')).toMatchObject({ paymentDate: '2027-01-05' })
})
