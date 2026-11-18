import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { App } from '../../App.tsx'
import { testAccount } from '../../test/account.ts'
import { renderWithProviders } from '../../test/render.tsx'
import { fakeServer, sentBody } from '../../test/server.ts'
import type { Template } from '../budget/budget-api.ts'

afterEach(() => {
  vi.unstubAllGlobals()
})

const json = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status }))

const template: Template = {
  categories: [
    { id: 'c1', name: 'Salariu', entries: [{ id: 'e1', description: 'Salariu Ana', type: 'income', amountBani: 650_000 }] },
    { id: 'c2', name: 'Casă', entries: [{ id: 'e2', description: 'Chirie', type: 'expense', amountBani: 150_000 }] },
  ],
}

// The template as it was, then as it is after each change.
function server(first: Template, then: Template = first, routes: Parameters<typeof fakeServer>[0] = {}) {
  let reads = 0
  return fakeServer({
    '/api/user/me': [200, testAccount],
    'GET /api/template': () => json(200, reads++ === 0 ? first : then),
    ...routes,
  })
}

const renderApp = (path = '/sablon') => renderWithProviders(<App />, { path, withAuth: true })

test('is reached from the account menu', async () => {
  fakeServer({
    '/api/user/me': [200, testAccount],
    '/api/months': [200, []],
    'GET /api/template': [200, template],
  })
  renderApp('/setari')

  await userEvent.click(await screen.findByRole('button', { name: 'Meniu cont' }))
  await userEvent.click(screen.getByRole('menuitem', { name: 'Șablon buget' }))

  expect(await screen.findByRole('heading', { level: 1, name: 'Șablon buget' })).toBeDefined()
})

test('an empty template invites the first entry, which goes to the template', async () => {
  const added = { categories: [{ id: 'c2', name: 'Casă', entries: [{ id: 'e2', description: 'Chirie', type: 'expense', amountBani: 150_000 }] }] }
  const fetchMock = server({ categories: [] }, added as Template, {
    'POST /api/template/entries': [201, { id: 'e2', monthKey: null, categoryName: 'Casă', description: 'Chirie', type: 'expense', amountBani: 150_000 }],
  })
  renderApp()

  expect(await screen.findByRole('heading', { name: 'Șablonul este gol' })).toBeDefined()
  await userEvent.click(screen.getByRole('button', { name: 'Adaugă prima intrare' }))
  const dialog = screen.getByRole('dialog', { name: 'Adaugă în șablon' })
  expect(within(dialog).getByText('Se copiază în fiecare lună pornită din șablon.')).toBeDefined()
  await userEvent.selectOptions(within(dialog).getByLabelText('Tip'), 'Cheltuială')
  await userEvent.type(within(dialog).getByLabelText('Sumă'), '1.500')
  await userEvent.type(within(dialog).getByLabelText('Descriere'), 'Chirie')
  await userEvent.type(within(dialog).getByLabelText('Categorie'), 'Casă')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Salvează' }))

  expect(await screen.findByRole('button', { name: 'Editează Chirie' })).toBeDefined()
  expect(sentBody(fetchMock, '/api/template/entries')).toEqual({
    categoryName: 'Casă',
    description: 'Chirie',
    type: 'expense',
    amountBani: 150_000,
  })
})

test('lists the entries by category, and edits one without offering a month', async () => {
  const fetchMock = server(template, template, {
    'PATCH /api/entries/e2': [200, { id: 'e2', monthKey: null, categoryName: 'Casă', description: 'Chirie', type: 'expense', amountBani: 160_000 }],
  })
  renderApp()

  const card = (await screen.findByRole('heading', { name: 'Intrări în șablon' })).closest('section') as HTMLElement
  expect(within(card).getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual(['Salariu', 'Casă'])
  expect(within(card).getByText('2')).toBeDefined()

  await userEvent.click(screen.getByRole('button', { name: 'Editează Chirie' }))
  const dialog = screen.getByRole('dialog', { name: 'Editează intrarea din șablon' })
  expect(within(dialog).queryByLabelText('Luna')).toBeNull()
  const amount = within(dialog).getByLabelText('Sumă')
  await userEvent.clear(amount)
  await userEvent.type(amount, '1.600')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Salvează' }))

  await vi.waitFor(() => { expect(screen.queryByRole('dialog')).toBeNull() })
  expect(sentBody(fetchMock, '/api/entries/e2')).toEqual({
    categoryName: 'Casă',
    description: 'Chirie',
    type: 'expense',
    amountBani: 160_000,
  })
})

test('deletes an entry after asking', async () => {
  const fetchMock = server(template, { categories: template.categories.slice(0, 1) }, {
    'DELETE /api/entries/e2': [200, { ok: true }],
  })
  renderApp()

  await userEvent.click(await screen.findByRole('button', { name: 'Șterge Chirie' }))
  const dialog = screen.getByRole('dialog', { name: 'Șterge din șablon' })
  expect(within(dialog).getByText('„Chirie” se șterge din șablon. Lunile create deja nu se schimbă.')).toBeDefined()
  await userEvent.click(within(dialog).getByRole('button', { name: 'Șterge' }))

  await vi.waitFor(() => { expect(screen.queryByRole('button', { name: 'Șterge Chirie' })).toBeNull() })
  expect(fetchMock.mock.calls.some(([path, init]) => path === '/api/entries/e2' && init?.method === 'DELETE')).toBe(true)
})
