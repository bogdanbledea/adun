import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { App } from '../../App.tsx'
import { testAccount } from '../../test/account.ts'
import { renderWithProviders } from '../../test/render.tsx'
import { fakeServer, sentBody } from '../../test/server.ts'
import type { Month } from './budget-api.ts'

// "Today" is 18 November 2026, so the strip runs from November 2025 to December 2027.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 18, 12))
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const renderApp = (path: string) => renderWithProviders(<App />, { path, withAuth: true })

const december: Month = {
  monthKey: '2026-12',
  categories: [
    {
      id: 'c1',
      name: 'Casă',
      entries: [
        { id: 'e1', description: 'Chirie', type: 'expense', amountBani: 150_000 },
        { id: 'e2', description: 'Curent', type: 'expense', amountBani: 25_050 },
      ],
    },
    { id: 'c2', name: 'Salariu', entries: [{ id: 'e3', description: 'Salariu Ana', type: 'income', amountBani: 650_000 }] },
  ],
  totals: { incomeBani: 650_000, expenseBani: 175_050, balanceBani: 474_950 },
}

const withDecember = (extra: Parameters<typeof fakeServer>[0] = {}) =>
  fakeServer({
    '/api/user/me': [200, testAccount],
    '/api/months': [200, ['2026-10', '2026-12']],
    'GET /api/months/2026-12': [200, december],
    ...extra,
  })

test('the title and the month strip share a row, with months around today', async () => {
  withDecember()
  renderApp('/buget/12-26')

  expect(await screen.findByRole('heading', { level: 1, name: 'Buget' })).toBeDefined()
  const strip = screen.getByRole('navigation', { name: 'Selectează luna' })
  const links = within(strip).getAllByRole('link')
  expect(links[1]?.textContent).toBe("Nov '25")
  expect(links.at(-2)?.textContent).toBe("Dec '27")
  expect(await within(strip).findByRole('link', { name: 'Oct, are buget' })).toBeDefined()
  expect(within(strip).getByRole('link', { current: 'page' }).textContent).toBe('Dec, are buget')
  expect(within(strip).getByRole('link', { name: 'Luna anterioară' }).getAttribute('href')).toBe('/buget/11-26')
  expect(within(strip).getByRole('link', { name: 'Luna următoare' }).getAttribute('href')).toBe('/buget/01-27')
})

test('/buget, a month outside the strip or a bad one opens the current month', async () => {
  for (const path of ['/buget', '/buget/01-29', '/buget/13-26', '/buget/2026-11']) {
    withDecember({ 'GET /api/months/2026-11': [404, { error: { code: 'month_not_found', message: 'x' } }] })
    const { unmount } = renderApp(path)
    expect(await screen.findByRole('heading', { name: 'Noiembrie 2026 nu are încă un buget' }), path).toBeDefined()
    unmount()
  }
})

test('offers to create a month without a budget, then shows it', async () => {
  const fetchMock = withDecember({
    'POST /api/months': [201, { monthKey: '2026-11', categories: [], totals: { incomeBani: 0, expenseBani: 0, balanceBani: 0 } }],
    'GET /api/months/2026-11': [200, { monthKey: '2026-11', categories: [], totals: { incomeBani: 0, expenseBani: 0, balanceBani: 0 } }],
  })
  renderApp('/buget/11-26')

  expect(await screen.findByText('Foaie nouă')).toBeDefined()
  expect(screen.getByText('Deschide bugetul lunii și notează primele venituri și cheltuieli.')).toBeDefined()
  await userEvent.click(screen.getByRole('button', { name: 'Creează un buget gol' }))

  expect(await screen.findByRole('heading', { name: 'Nicio tranzacție' })).toBeDefined()
  expect(sentBody(fetchMock, '/api/months')).toEqual({ monthKey: '2026-11' })
  const strip = screen.getByRole('navigation', { name: 'Selectează luna' })
  expect(within(strip).getByRole('link', { current: 'page' }).textContent).toBe('Nov, are buget')
})

test('the summary shows what is left and how much of the income is spent', async () => {
  withDecember()
  renderApp('/buget/12-26')

  const summary = await screen.findByRole('region', { name: 'Rezumatul lunii' })
  expect(within(summary).getByRole('heading').textContent).toBe('Rămas în decembrie')
  expect(within(summary).getByText('4.749,50')).toBeDefined()
  expect(within(summary).getByRole('progressbar', { name: '27% din venituri cheltuite' })).toBeDefined()
  expect(within(summary).getByText('6.500,00').closest('dd')).toBeDefined()
})

test('a month spending more than came in is over budget', async () => {
  withDecember({
    'GET /api/months/2026-12': [200, { ...december, totals: { incomeBani: 100_000, expenseBani: 175_050, balanceBani: -75_050 } }],
  })
  renderApp('/buget/12-26')
  const summary = await screen.findByRole('region', { name: 'Rezumatul lunii' })
  expect(within(summary).getByText('Peste buget')).toBeDefined()
  expect(within(summary).getByText('−750,50')).toBeDefined()
})

test('lists the categories with their totals and entries, and filters them', async () => {
  withDecember()
  renderApp('/buget/12-26')

  const list = await screen.findByRole('region', { name: 'Tranzacții' })
  expect(within(list).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Casă', 'Salariu'])
  expect(within(list).getByText('−1.750,50')).toBeDefined()
  expect(within(list).getByRole('button', { name: 'Editează Chirie' })).toBeDefined()

  await userEvent.click(within(list).getByRole('button', { name: 'Venituri' }))
  expect(within(list).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Salariu'])
  await userEvent.click(within(list).getByRole('button', { name: 'Toate' }))
  expect(within(list).getAllByRole('heading', { level: 3 })).toHaveLength(2)
})

test('deletes a month after asking, and offers to create it again', async () => {
  const fetchMock = withDecember({ 'DELETE /api/months/2026-12': [200, { ok: true }] })
  renderApp('/buget/12-26')

  await userEvent.click(await screen.findByRole('button', { name: 'Acțiuni pentru lună' }))
  await userEvent.click(screen.getByRole('menuitem', { name: 'Șterge luna' }))
  const dialog = screen.getByRole('dialog', { name: 'Șterge luna: Decembrie 2026' })
  expect(within(dialog).getByText(/Se șterg toate cele 3 tranzacții/)).toBeDefined()
  await userEvent.click(within(dialog).getByRole('button', { name: 'Șterge luna' }))

  expect(await screen.findByRole('heading', { name: 'Decembrie 2026 nu are încă un buget' })).toBeDefined()
  expect(fetchMock.mock.calls.some((args) => args[0] === '/api/months/2026-12' && args[1]?.method === 'DELETE')).toBe(true)
})

test('says why the months could not be loaded, and tries again', async () => {
  let fail = true
  fakeServer({
    '/api/user/me': [200, testAccount],
    '/api/months': () =>
      Promise.resolve(
        fail
          ? new Response(JSON.stringify({ error: { code: 'internal_error', message: 'x' } }), { status: 500 })
          : new Response(JSON.stringify([]), { status: 200 }),
      ),
  })
  renderApp('/buget/11-26')

  expect((await screen.findByRole('alert')).textContent).toContain('Bugetul nu a putut fi încărcat.')
  fail = false
  await userEvent.click(screen.getByRole('button', { name: 'Încearcă din nou' }))
  expect(await screen.findByText('Foaie nouă')).toBeDefined()
})
