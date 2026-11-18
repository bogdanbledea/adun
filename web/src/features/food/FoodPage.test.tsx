import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { App } from '../../App.tsx'
import { testAccount } from '../../test/account.ts'
import { renderWithProviders } from '../../test/render.tsx'
import { fakeServer, sentBody } from '../../test/server.ts'
import { todayDate } from '../budget/month-key.ts'
import type { EmptyFoodMonth, FoodMonth } from './food-api.ts'

afterEach(() => {
  vi.unstubAllGlobals()
})

const today = todayDate()
const at = (path: string) => `${path}?today=${today}`

const period = { start: '2026-11-01', end: '2026-11-30', ruleStart: '2026-11-01', rule: 'calendar' as const }

const empty: EmptyFoodMonth = {
  monthKey: '2026-12',
  period: { start: '2026-12-01', end: '2026-12-31', ruleStart: '2026-12-01', rule: 'calendar' },
  exists: false,
  suggestedFrom: null,
  suggestedSources: [],
}

const november: FoodMonth = {
  monthKey: '2026-11',
  period,
  exists: true,
  totalBani: 170_000,
  spentBani: 27_000,
  remainingBani: 143_000,
  sources: [
    { id: 's1', name: 'Card', amountBani: 150_000, spentBani: 10_000, remainingBani: 140_000 },
    { id: 's2', name: 'Cash', amountBani: 20_000, spentBani: 17_000, remainingBani: 3_000 },
  ],
}

const renderPage = (path: string) => renderWithProviders(<App />, { path, withAuth: true })

test('/mancare opens the month whose money today belongs to', async () => {
  fakeServer({
    '/api/user/me': [200, testAccount],
    [at('/api/food/current')]: [200, { monthKey: '2026-11' }],
    [at('/api/food/2026-11')]: [200, november],
  })
  renderPage('/mancare')
  expect(await screen.findByText('Noiembrie 2026')).toBeDefined()
  expect(await screen.findByRole('heading', { name: 'Rămas în noiembrie' })).toBeDefined()
})

test('a month shows what is left of it and of each source', async () => {
  fakeServer({ '/api/user/me': [200, testAccount], [at('/api/food/2026-11')]: [200, november] })
  renderPage('/mancare/11-26')

  const month = (await screen.findByRole('heading', { name: 'Rămas în noiembrie' })).closest('section') as HTMLElement
  expect(month.textContent).toContain('1.430lei')
  expect(month.textContent).toContain('din 1.700lei')
  expect(within(month).getByText('16% cheltuit')).toBeDefined()

  const sources = screen.getByRole('heading', { name: 'Surse' }).closest('section') as HTMLElement
  expect(within(sources).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
    'Card1.400lei / 1.500',
    'Cash30lei / 200',
  ])
})

test('a month without a budget offers to start from the latest one', async () => {
  const fetchMock = fakeServer({
    '/api/user/me': [200, testAccount],
    [at('/api/food/2026-12')]: [
      200,
      { ...empty, suggestedFrom: '2026-11', suggestedSources: [{ name: 'Card', amountBani: 150_000 }] },
    ],
    [`PUT ${at('/api/food/2026-12/sources')}`]: [200, { ...november, monthKey: '2026-12', period: empty.period }],
  })
  renderPage('/mancare/12-26')

  expect(await screen.findByRole('heading', { name: 'Cât pui deoparte pentru mâncare?' })).toBeDefined()
  expect(screen.getByText(/Pune suma pentru decembrie \(1–31 dec\.\)/)).toBeDefined()
  await userEvent.click(screen.getByRole('button', { name: 'Pornește de la Noiembrie 2026' }))

  const dialog = screen.getByRole('dialog', { name: 'Buget de mâncare · Decembrie 2026' })
  expect(within(dialog).getByLabelText<HTMLInputElement>('Nume sursă 1').value).toBe('Card')
  expect(within(dialog).getByLabelText<HTMLInputElement>('Sumă sursa 1 (lei)').value).toBe('1500')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Adaugă Cash' }))
  await userEvent.type(within(dialog).getByLabelText('Sumă sursa 2 (lei)'), '200,50')
  expect(within(dialog).getByText('Total pentru mâncare').parentElement?.textContent).toContain('1.700,50')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Salvează' }))

  expect(sentBody(fetchMock, at('/api/food/2026-12/sources'))).toEqual({
    sources: [
      { name: 'Card', amountBani: 150_000 },
      { name: 'Cash', amountBani: 20_050 },
    ],
  })
  expect(await screen.findByRole('heading', { name: 'Rămas în decembrie' })).toBeDefined()
})

test('the sources dialog asks for a name and an amount, and moves the start only when changed', async () => {
  const fetchMock = fakeServer({
    '/api/user/me': [200, testAccount],
    [at('/api/food/2026-11')]: [200, november],
    [`PUT ${at('/api/food/2026-11/sources')}`]: [200, november],
  })
  renderPage('/mancare/11-26')
  await userEvent.click(await screen.findByRole('button', { name: 'Editează sursele și perioada' }))
  const dialog = screen.getByRole('dialog', { name: 'Banii de mâncare' })

  await userEvent.clear(within(dialog).getByLabelText('Sumă sursa 2 (lei)'))
  await userEvent.click(within(dialog).getByRole('button', { name: 'Salvează' }))
  expect(within(dialog).getByText('Fiecare sursă are nevoie de un nume și o sumă.')).toBeDefined()

  await userEvent.type(within(dialog).getByLabelText('Sumă sursa 2 (lei)'), '250')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Salvează' }))
  expect(sentBody(fetchMock, at('/api/food/2026-11/sources'))).toEqual({
    sources: [
      { id: 's1', name: 'Card', amountBani: 150_000 },
      { id: 's2', name: 'Cash', amountBani: 25_000 },
    ],
  })
})

test('a start moved by hand shows the period and a way back to the rule', async () => {
  const moved = { ...november, period: { ...period, start: '2026-10-28', end: '2026-11-26' } }
  fakeServer({ '/api/user/me': [200, testAccount], [at('/api/food/2026-11')]: [200, moved] })
  renderPage('/mancare/11-26')

  expect(await screen.findByText('28 oct. – 26 nov.')).toBeDefined()
  await userEvent.click(screen.getByRole('button', { name: 'Editează sursele și perioada' }))
  const dialog = screen.getByRole('dialog')
  expect(within(dialog).getByText(/Până pe 26 noiembrie 2026/)).toBeDefined()
  await userEvent.click(within(dialog).getByRole('button', { name: 'De la 1 (1 nov.)' }))
  expect(within(dialog).getByLabelText<HTMLInputElement>('Banii acoperă de la').value).toBe('2026-11-01')
})

test('a month that cannot be loaded says so and can be tried again', async () => {
  fakeServer({ '/api/user/me': [200, testAccount], [at('/api/food/2026-11')]: [500, { error: { code: 'internal_error' } }] })
  renderPage('/mancare/11-26')
  expect(await screen.findByText(/Nu am putut încărca bugetul de mâncare/)).toBeDefined()
  expect(screen.getByRole('button', { name: 'Încearcă din nou' })).toBeDefined()
})
