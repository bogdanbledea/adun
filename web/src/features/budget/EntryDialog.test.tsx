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
  categories: [{ id: 'c1', name: 'Casă', entries: [{ id: 'e1', description: 'Chirie', type: 'expense', amountBani: 150_000 }] }],
  totals: { incomeBani: 0, expenseBani: 150_000, balanceBani: -150_000 },
}
const after: Month = {
  ...before,
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

const renderApp = () => renderWithProviders(<App />, { path: '/buget/12-26', withAuth: true })

async function openAdd() {
  await userEvent.click(await screen.findByRole('button', { name: 'Adaugă' }))
  return screen.getByRole('dialog', { name: 'Adaugă tranzacție nouă' })
}

test('adds an expense, picking an existing category, and shows the month as stored', async () => {
  const fetchMock = server({ 'POST /api/entries': [201, saved] })
  renderApp()

  const dialog = await openAdd()
  expect(within(dialog).getByLabelText('Sumă')).toBe(document.activeElement)
  await userEvent.selectOptions(within(dialog).getByLabelText('Tip'), 'Cheltuială')
  await userEvent.type(within(dialog).getByLabelText('Sumă'), '45,50')
  await userEvent.type(within(dialog).getByLabelText('Descriere'), ' Curent ')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Casă' }))
  await userEvent.click(within(dialog).getByRole('button', { name: 'Salvează' }))

  expect(await screen.findByRole('button', { name: 'Editează Curent' })).toBeDefined()
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(sentBody(fetchMock, '/api/entries')).toEqual({
    monthKey: '2026-12',
    categoryName: 'Casă',
    description: 'Curent',
    type: 'expense',
    amountBani: 4550,
  })
})

test('a new entry is income unless changed, and a category’s + fills in its name', async () => {
  const fetchMock = server({ 'POST /api/entries': [201, { ...saved, type: 'income' }] })
  renderApp()

  await userEvent.click(await screen.findByRole('button', { name: 'Adaugă în Casă' }))
  const dialog = screen.getByRole('dialog', { name: 'Adaugă tranzacție nouă' })
  expect(within(dialog).getByRole('button', { name: 'Casă' }).getAttribute('aria-pressed')).toBe('true')
  await userEvent.type(within(dialog).getByLabelText('Sumă'), '1.200')
  await userEvent.type(within(dialog).getByLabelText('Descriere'), 'Chirie primită')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Salvează' }))

  await screen.findByRole('button', { name: 'Editează Curent' })
  expect(sentBody(fetchMock, '/api/entries')).toMatchObject({ categoryName: 'Casă', type: 'income', amountBani: 120_000 })
})

test('says what is missing instead of sending', async () => {
  const fetchMock = server()
  renderApp()

  const dialog = await openAdd()
  await userEvent.type(within(dialog).getByLabelText('Sumă'), 'doi lei')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Salvează' }))

  expect(within(dialog).getByText('Scrie o sumă între 0 și 9.999.999.999, cu cel mult două zecimale.')).toBeDefined()
  expect(within(dialog).getByText('Scrie o descriere.')).toBeDefined()
  expect(within(dialog).getByText('Alege sau scrie o categorie.')).toBeDefined()
  expect(fetchMock.mock.calls.some((args) => args[1]?.method === 'POST')).toBe(false)
})

test('a row opens its entry for editing', async () => {
  const fetchMock = server({ 'PATCH /api/entries/e1': [200, { ...saved, id: 'e1', description: 'Chirie', amountBani: 160_000 }] })
  renderApp()

  await userEvent.click(await screen.findByText('Chirie'))
  const dialog = screen.getByRole('dialog', { name: 'Editează tranzacția' })
  const amount = within(dialog).getByLabelText('Sumă')
  expect(amount).toHaveProperty('value', '1500,00')
  await userEvent.clear(amount)
  await userEvent.type(amount, '1600')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Salvează' }))

  await screen.findByRole('button', { name: 'Editează Curent' })
  expect(sentBody(fetchMock, '/api/entries/e1')).toEqual({
    monthKey: '2026-12',
    categoryName: 'Casă',
    description: 'Chirie',
    type: 'expense',
    amountBani: 160_000,
  })
})

test('moving an entry to another month says where it went, with a link there', async () => {
  const fetchMock = server({ 'PATCH /api/entries/e1': [200, { ...saved, id: 'e1', description: 'Chirie', monthKey: '2027-01' }] })
  renderApp()

  await userEvent.click(await screen.findByRole('button', { name: 'Editează Chirie' }))
  const dialog = screen.getByRole('dialog', { name: 'Editează tranzacția' })
  await userEvent.selectOptions(within(dialog).getByLabelText('Luna'), 'Ianuarie 2027')
  expect(within(dialog).getByText(/Se mută în Ianuarie 2027 — bugetul lunii va fi creat automat/)).toBeDefined()
  await userEvent.click(within(dialog).getByRole('button', { name: 'Salvează și mută' }))

  expect(await screen.findByText(/„Chirie” a fost mutată în Ianuarie 2027./)).toBeDefined()
  expect(screen.getByRole('link', { name: 'Vezi luna' }).getAttribute('href')).toBe('/buget/01-27')
  expect(sentBody(fetchMock, '/api/entries/e1')).toMatchObject({ monthKey: '2027-01' })
})

test('deletes an entry after asking', async () => {
  const fetchMock = server({ 'DELETE /api/entries/e1': [200, { ok: true }] })
  renderApp()

  await userEvent.click(await screen.findByRole('button', { name: 'Editează Chirie' }))
  await userEvent.click(within(screen.getByRole('dialog', { name: 'Editează tranzacția' })).getByRole('button', { name: 'Șterge' }))
  const confirm = screen.getByRole('dialog', { name: 'Șterge tranzacția' })
  expect(within(confirm).getByText('„Chirie” se șterge. Această acțiune nu poate fi anulată.')).toBeDefined()
  await userEvent.click(within(confirm).getByRole('button', { name: 'Șterge' }))

  await screen.findByRole('button', { name: 'Editează Curent' })
  expect(fetchMock.mock.calls.some((args) => args[0] === '/api/entries/e1' && args[1]?.method === 'DELETE')).toBe(true)
})

test('a row’s delete button asks first too', async () => {
  server()
  renderApp()
  await userEvent.click(await screen.findByRole('button', { name: 'Șterge Chirie' }))
  expect(screen.getByRole('dialog', { name: 'Șterge tranzacția' })).toBeDefined()
  await userEvent.click(screen.getByRole('button', { name: 'Anulează' }))
  expect(screen.queryByRole('dialog')).toBeNull()
})

test('keeps the dialog open and says why when the server refuses', async () => {
  server({ 'POST /api/entries': [409, { error: { code: 'limit_reached', message: 'Limit.' } }] })
  renderApp()

  const dialog = await openAdd()
  await userEvent.type(within(dialog).getByLabelText('Sumă'), '45')
  await userEvent.type(within(dialog).getByLabelText('Descriere'), 'Curent')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Casă' }))
  await userEvent.click(within(dialog).getByRole('button', { name: 'Salvează' }))

  expect((await within(dialog).findByRole('alert')).textContent).toBe(
    'Ai atins numărul maxim permis. Șterge din cele existente ca să adaugi altele.',
  )
  expect(screen.getByRole('dialog', { name: 'Adaugă tranzacție nouă' })).toBeDefined()
})
