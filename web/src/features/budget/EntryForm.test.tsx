import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { App } from '../../App.tsx'
import { testAccount } from '../../test/account.ts'
import { renderWithProviders } from '../../test/render.tsx'
import { fakeServer, sentBody } from '../../test/server.ts'
import type { Month } from './budget-api.ts'

afterEach(() => {
  vi.unstubAllGlobals()
})

const renderApp = (path = '/buget/2026-12') => renderWithProviders(<App />, { path, withAuth: true })
const json = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status }))

const before: Month = {
  monthKey: '2026-12',
  categories: [{ id: 'c1', name: 'Casă', entries: [{ id: 'e1', description: 'Chirie', type: 'expense', amountBani: 150_000 }] }],
  totals: { incomeBani: 0, expenseBani: 150_000, balanceBani: -150_000 },
}
const after: Month = {
  monthKey: '2026-12',
  categories: [
    {
      id: 'c1',
      name: 'Casă',
      entries: [
        { id: 'e1', description: 'Chirie', type: 'expense', amountBani: 150_000 },
        { id: 'e2', description: 'Curent', type: 'expense', amountBani: 4550 },
      ],
    },
  ],
  totals: { incomeBani: 0, expenseBani: 154_550, balanceBani: -154_550 },
}
const saved = { id: 'e2', monthKey: '2026-12', categoryName: 'Casă', description: 'Curent', type: 'expense', amountBani: 4550 }

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

test('adds an entry and shows the month as stored', async () => {
  const fetchMock = server({ 'POST /api/entries': [201, saved] })
  renderApp()

  await userEvent.click(await screen.findByRole('button', { name: 'Adaugă' }))
  const form = screen.getByRole('form', { name: 'Înregistrare nouă' })
  await userEvent.type(within(form).getByLabelText('Descriere'), ' Curent ')
  await userEvent.type(within(form).getByLabelText('Sumă (lei)'), '45,50')
  await userEvent.type(within(form).getByLabelText('Categorie'), 'Casă')
  await userEvent.click(within(form).getByRole('button', { name: 'Salvează' }))

  expect(await screen.findByRole('button', { name: /Curent/ })).toBeDefined()
  expect(screen.queryByRole('form')).toBeNull()
  expect(sentBody(fetchMock, '/api/entries')).toEqual({
    monthKey: '2026-12',
    categoryName: 'Casă',
    description: 'Curent',
    type: 'expense',
    amountBani: 4550,
  })
})

test('adds income from a category, with its name filled in', async () => {
  const fetchMock = server({ 'POST /api/entries': [201, { ...saved, type: 'income' }] })
  renderApp()

  await userEvent.click(await screen.findByRole('button', { name: 'Adaugă în Casă' }))
  const form = screen.getByRole('form', { name: 'Înregistrare nouă' })
  expect(within(form).getByLabelText('Categorie')).toHaveProperty('value', 'Casă')
  await userEvent.click(within(form).getByRole('radio', { name: 'Venit' }))
  await userEvent.type(within(form).getByLabelText('Descriere'), 'Chirie primită')
  await userEvent.type(within(form).getByLabelText('Sumă (lei)'), '1.200')
  await userEvent.click(within(form).getByRole('button', { name: 'Salvează' }))

  await screen.findByRole('button', { name: /Curent/ })
  expect(sentBody(fetchMock, '/api/entries')).toMatchObject({ categoryName: 'Casă', type: 'income', amountBani: 120_000 })
})

test('says what is missing instead of sending', async () => {
  const fetchMock = server()
  renderApp()

  await userEvent.click(await screen.findByRole('button', { name: 'Adaugă' }))
  await userEvent.type(screen.getByLabelText('Sumă (lei)'), 'doi lei')
  await userEvent.click(screen.getByRole('button', { name: 'Salvează' }))

  expect(screen.getByText('Scrie o descriere.')).toBeDefined()
  expect(screen.getByText('Scrie o categorie.')).toBeDefined()
  expect(screen.getByText('Scrie o sumă, de exemplu 120 sau 45,50.')).toBeDefined()
  expect(fetchMock.mock.calls.some((args) => args[1]?.method === 'POST')).toBe(false)
})

test('changes an entry in its place', async () => {
  const fetchMock = server({ 'PATCH /api/entries/e1': [200, { ...saved, id: 'e1', description: 'Chirie', amountBani: 160_000 }] })
  renderApp()

  await userEvent.click(await screen.findByRole('button', { name: /Chirie/ }))
  const form = screen.getByRole('form', { name: 'Modifică înregistrarea' })
  const amount = within(form).getByLabelText('Sumă (lei)')
  expect(amount).toHaveProperty('value', '1500,00')
  await userEvent.clear(amount)
  await userEvent.type(amount, '1600')
  await userEvent.click(within(form).getByRole('button', { name: 'Salvează' }))

  await screen.findByRole('button', { name: /Curent/ })
  expect(sentBody(fetchMock, '/api/entries/e1')).toEqual({
    monthKey: '2026-12',
    categoryName: 'Casă',
    description: 'Chirie',
    type: 'expense',
    amountBani: 160_000,
  })
})

test('moving an entry to another month says where it went', async () => {
  const fetchMock = server({ 'PATCH /api/entries/e1': [200, { ...saved, id: 'e1', monthKey: '2027-01' }] })
  renderApp()

  await userEvent.click(await screen.findByRole('button', { name: /Chirie/ }))
  const month = screen.getByLabelText('Luna')
  await userEvent.clear(month)
  await userEvent.type(month, '2027-01')
  await userEvent.click(screen.getByRole('button', { name: 'Salvează' }))

  expect(await screen.findByText('Înregistrarea a fost mutată în Ianuarie 2027.')).toBeDefined()
  expect(sentBody(fetchMock, '/api/entries/e1')).toMatchObject({ monthKey: '2027-01' })
})

test('deletes an entry after asking', async () => {
  const fetchMock = server({ 'DELETE /api/entries/e1': [200, { ok: true }] })
  renderApp()

  await userEvent.click(await screen.findByRole('button', { name: /Chirie/ }))
  await userEvent.click(screen.getByRole('button', { name: 'Șterge' }))
  expect(screen.getByText('Ștergi înregistrarea?')).toBeDefined()
  await userEvent.click(screen.getByRole('button', { name: 'Da, șterge' }))

  await screen.findByRole('button', { name: /Curent/ })
  expect(fetchMock.mock.calls.some((args) => args[0] === '/api/entries/e1' && args[1]?.method === 'DELETE')).toBe(true)
})

test('keeps the form open and says why when the server refuses', async () => {
  server({ 'POST /api/entries': [409, { error: { code: 'limit_reached', message: 'Limit.' } }] })
  renderApp()

  await userEvent.click(await screen.findByRole('button', { name: 'Adaugă' }))
  await userEvent.type(screen.getByLabelText('Descriere'), 'Curent')
  await userEvent.type(screen.getByLabelText('Sumă (lei)'), '45')
  await userEvent.type(screen.getByLabelText('Categorie'), 'Casă')
  await userEvent.click(screen.getByRole('button', { name: 'Salvează' }))

  expect((await screen.findByRole('alert')).textContent).toBe(
    'Ai atins numărul maxim permis. Șterge din cele existente ca să adaugi altele.',
  )
  expect(screen.getByRole('form', { name: 'Înregistrare nouă' })).toBeDefined()
})
