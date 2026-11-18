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
  vi.useRealTimers()
})

const renderApp = (path: string) => renderWithProviders(<App />, { path, withAuth: true })

const november: Month = {
  monthKey: '2026-11',
  categories: [],
  totals: { incomeBani: 650_000, expenseBani: 712_050, balanceBani: -62_050 },
}
const noBudget: [number, unknown] = [404, { error: { code: 'month_not_found', message: 'This month has no budget yet.' } }]

test('shows the month’s totals and marks the months with a budget', async () => {
  fakeServer({
    '/api/user/me': [200, testAccount],
    '/api/months': [200, ['2026-10', '2026-11']],
    '/api/months/2026-11': [200, november],
  })
  renderApp('/buget/2026-11')

  expect(await screen.findByRole('heading', { name: 'Noiembrie 2026' })).toBeDefined()
  const totals = screen.getByLabelText('Totalurile lunii')
  expect(within(totals).getByText('6.500,00 lei')).toBeDefined()
  expect(within(totals).getByText('7.120,50 lei')).toBeDefined()
  expect(within(totals).getByText('-620,50 lei')).toBeDefined()

  const strip = screen.getByRole('navigation', { name: 'Lunile anului' })
  expect(await within(strip).findByRole('link', { name: 'Oct, are buget' })).toBeDefined()
  expect(within(strip).getByRole('link', { current: 'page' }).getAttribute('aria-label')).toBe('Nov, are buget')
  expect(within(strip).getByRole('link', { name: 'Dec' })).toBeDefined()
})

test('opens the current month at /buget', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 18, 12))
  fakeServer({
    '/api/user/me': [200, testAccount],
    '/api/months': [200, ['2026-11']],
    '/api/months/2026-11': [200, november],
  })
  renderApp('/buget')
  expect(await screen.findByRole('heading', { name: 'Noiembrie 2026' })).toBeDefined()
})

test('the arrows go to the month before and after, across years', async () => {
  fakeServer({ '/api/user/me': [200, testAccount], '/api/months': [200, []], '/api/months/2026-01': noBudget })
  renderApp('/buget/2026-01')
  expect((await screen.findByRole('link', { name: 'Luna anterioară' })).getAttribute('href')).toBe('/buget/2025-12')
  expect(screen.getByRole('link', { name: 'Luna următoare' }).getAttribute('href')).toBe('/buget/2026-02')
})

test('offers to create a month without a budget, then shows it', async () => {
  const fetchMock = fakeServer({
    '/api/user/me': [200, testAccount],
    '/api/months': [200, []],
    'GET /api/months/2026-12': noBudget,
    'POST /api/months': [201, { ...november, monthKey: '2026-12', totals: { incomeBani: 0, expenseBani: 0, balanceBani: 0 } }],
  })
  renderApp('/buget/2026-12')

  expect(await screen.findByRole('heading', { name: 'Decembrie 2026 nu are încă buget' })).toBeDefined()
  await userEvent.click(screen.getByRole('button', { name: 'Creează bugetul' }))

  expect(await screen.findByRole('heading', { name: 'Decembrie 2026' })).toBeDefined()
  expect(sentBody(fetchMock, '/api/months')).toEqual({ monthKey: '2026-12' })
  expect(screen.getByRole('link', { name: 'Dec, are buget' })).toBeDefined()
})

test('says why a month could not be loaded, and tries again', async () => {
  let fail = true
  fakeServer({
    '/api/user/me': [200, testAccount],
    '/api/months': [200, []],
    '/api/months/2026-11': () =>
      Promise.resolve(
        fail
          ? new Response(JSON.stringify({ error: { code: 'internal_error', message: 'x', requestId: 'r1' } }), { status: 500 })
          : new Response(JSON.stringify(november), { status: 200 }),
      ),
  })
  renderApp('/buget/2026-11')

  expect((await screen.findByRole('alert')).textContent).toContain('Luna nu s-a putut încărca.')
  fail = false
  await userEvent.click(screen.getByRole('button', { name: 'Încearcă din nou' }))
  expect(await screen.findByRole('heading', { name: 'Noiembrie 2026' })).toBeDefined()
})

test('a month that does not exist is a page not found', async () => {
  fakeServer({ '/api/user/me': [200, testAccount], '/api/months': [200, []] })
  renderApp('/buget/2026-13')
  expect(await screen.findByRole('heading', { name: 'Pagina nu există' })).toBeDefined()
})

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

test('lists the categories in order with their entries and what they add up to', async () => {
  fakeServer({ '/api/user/me': [200, testAccount], '/api/months': [200, ['2026-12']], '/api/months/2026-12': [200, december] })
  renderApp('/buget/2026-12')

  const home = await screen.findByRole('region', { name: 'Casă' })
  expect(within(home).getByRole('heading', { name: 'Casă' }).parentElement?.textContent).toBe('Casă1.750,50 lei')
  expect(within(home).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
    'Chirie1.500,00 lei',
    'Curent250,50 lei',
  ])
  const salary = screen.getByRole('region', { name: 'Salariu' })
  expect(within(salary).getByRole('listitem').textContent).toBe('Salariu Ana+6.500,00 lei')
  expect(screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual(['Casă', 'Salariu'])
})

test('a month with a budget and nothing in it says so', async () => {
  fakeServer({ '/api/user/me': [200, testAccount], '/api/months': [200, ['2026-11']], '/api/months/2026-11': [200, { ...november, categories: [] }] })
  renderApp('/buget/2026-11')
  expect(await screen.findByText('Nicio înregistrare încă.')).toBeDefined()
})

test('deletes a month after asking, and offers to create it again', async () => {
  const fetchMock = fakeServer({
    '/api/user/me': [200, testAccount],
    '/api/months': [200, ['2026-12']],
    'GET /api/months/2026-12': [200, december],
    'DELETE /api/months/2026-12': [200, { ok: true }],
  })
  renderApp('/buget/2026-12')

  await userEvent.click(await screen.findByRole('button', { name: 'Opțiunile lunii' }))
  await userEvent.click(screen.getByRole('menuitem', { name: 'Șterge luna' }))
  expect(screen.getByText('Ștergi Decembrie 2026 și toate înregistrările ei? Nu se poate anula.')).toBeDefined()
  await userEvent.click(screen.getByRole('button', { name: 'Renunță' }))
  expect(fetchMock.mock.calls.some((args) => args[1]?.method === 'DELETE')).toBe(false)

  await userEvent.click(screen.getByRole('button', { name: 'Opțiunile lunii' }))
  await userEvent.click(screen.getByRole('menuitem', { name: 'Șterge luna' }))
  await userEvent.click(screen.getByRole('button', { name: 'Da, șterge' }))

  expect(await screen.findByRole('heading', { name: 'Decembrie 2026 nu are încă buget' })).toBeDefined()
  expect(screen.getByRole('link', { name: 'Dec' })).toBeDefined()
})

test('keeps the month and says why when deleting fails', async () => {
  fakeServer({
    '/api/user/me': [200, testAccount],
    '/api/months': [200, ['2026-12']],
    'GET /api/months/2026-12': [200, december],
    'DELETE /api/months/2026-12': [429, { error: { code: 'rate_limited', message: 'Too many requests.' } }],
  })
  renderApp('/buget/2026-12')
  await userEvent.click(await screen.findByRole('button', { name: 'Opțiunile lunii' }))
  await userEvent.click(screen.getByRole('menuitem', { name: 'Șterge luna' }))
  await userEvent.click(screen.getByRole('button', { name: 'Da, șterge' }))
  expect((await screen.findByRole('alert')).textContent).toBe('Prea multe cereri. Încearcă din nou mai târziu.')
  expect(screen.getByRole('region', { name: 'Casă' })).toBeDefined()
})
