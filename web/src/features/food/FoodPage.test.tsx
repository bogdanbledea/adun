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
  weeks: [],
  currentWeek: null,
  merchants: [],
  purchases: [],
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

test('the running week shows what is left, the pace and the weeks', async () => {
  const week = { index: 2, start: '2026-11-02', end: '2026-11-08', days: 7, state: 'current' as const, estimated: false, beforeStart: false }
  const data: FoodMonth = {
    ...november,
    weeks: [
      { ...week, index: 1, start: '2026-11-01', end: '2026-11-01', days: 1, allowanceBani: 0, spentBani: 8_450, remainingBani: -8_450, state: 'past', beforeStart: true },
      { ...week, allowanceBani: 40_000, spentBani: 25_000, remainingBani: 15_000 },
    ],
    currentWeek: { ...week, allowanceBani: 40_000, spentBani: 25_000, remainingBani: 15_000, daysElapsed: 3, daysLeft: 5, paceBani: 17_143, perDayLeftBani: 3_000, status: 'behind' },
    merchants: [{ name: 'Lidl', totalBani: 27_000, count: 3 }],
  }
  fakeServer({ '/api/user/me': [200, testAccount], [at('/api/food/2026-11')]: [200, data] })
  renderPage('/mancare/11-26')

  const panel = (await screen.findByRole('heading', { name: 'Săptămâna aceasta' })).closest('section') as HTMLElement
  expect(within(panel).getByText('Atenție la ritm')).toBeDefined()
  expect(panel.textContent).toContain('rămași din 400lei')
  expect(panel.textContent).toContain('cel mult 171,43lei')
  const weeks = screen.getByRole('heading', { name: 'Săptămâni' }).closest('section') as HTMLElement
  expect(within(weeks).getAllByRole('button').map((b) => b.textContent)).toEqual([
    'Săpt. 1 · 1 nov. · 1 zi0leiînainte de buget · cheltuit 84,50lei',
    'Săpt. 2 · 2–8 nov.400leicheltuit 250lei · rămas 150lei',
  ])
  expect(screen.getByRole('heading', { name: 'Pe magazine' })).toBeDefined()
})

const lidl = {
  id: 'p1',
  merchant: 'Lidl',
  amountBani: 8_450,
  spentOn: '2026-11-03',
  note: 'Plin',
  sourceId: 's1',
  sourceName: 'Card',
  createdAt: '2026-11-03T10:00:00Z',
}

test('purchases are listed by day, and a week filters them', async () => {
  const weeks = [
    { index: 1, start: '2026-11-01', end: '2026-11-08', days: 7, allowanceBani: 0, spentBani: 0, remainingBani: 0, state: 'past' as const, estimated: false, beforeStart: false },
    { index: 2, start: '2026-11-09', end: '2026-11-15', days: 7, allowanceBani: 0, spentBani: 0, remainingBani: 0, state: 'past' as const, estimated: false, beforeStart: false },
  ]
  const data: FoodMonth = {
    ...november,
    weeks,
    purchases: [{ ...lidl, id: 'p2', merchant: 'Bolt Food', spentOn: '2026-11-10', note: null, sourceId: 's2', sourceName: 'Cash' }, lidl],
  }
  fakeServer({ '/api/user/me': [200, testAccount], [at('/api/food/2026-11')]: [200, data] })
  renderPage('/mancare/11-26')

  const list = (await screen.findByRole('heading', { name: 'Cumpărături' })).closest('section') as HTMLElement
  expect(within(list).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
    'Marți, 10 nov.84,50lei',
    'Marți, 3 nov.84,50lei',
  ])
  expect(within(list).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
    'Bolt FoodCash84,50lei',
    'LidlCard · Plin84,50lei',
  ])

  await userEvent.click(screen.getByRole('button', { name: /Săpt\. 2/ }))
  expect(within(list).getAllByRole('listitem')).toHaveLength(1)
  await userEvent.click(within(list).getByRole('button', { name: 'Arată toate cumpărăturile' }))
  expect(within(list).getAllByRole('listitem')).toHaveLength(2)
})

test('a purchase is added from the floating button', async () => {
  const fetchMock = fakeServer({
    '/api/user/me': [200, testAccount],
    [at('/api/food/2026-11')]: [200, november],
    'POST /api/food/2026-11/purchases': [201, lidl],
  })
  renderPage('/mancare/11-26')
  await userEvent.click(await screen.findByRole('button', { name: 'Adaugă o cumpărătură' }))
  const dialog = screen.getByRole('dialog', { name: 'Cumpărătură nouă' })

  await userEvent.click(within(dialog).getByRole('button', { name: 'Adaugă' }))
  expect(within(dialog).getByText('Scrie suma plătită, de exemplu 45,50.')).toBeDefined()
  expect(within(dialog).getByText('Alege sau scrie magazinul.')).toBeDefined()

  await userEvent.type(within(dialog).getByLabelText('Sumă (lei)'), '84,50')
  await userEvent.click(within(dialog).getByRole('radio', { name: 'Lidl' }))
  // The source with the most left is chosen.
  expect(within(dialog).getByRole<HTMLInputElement>('radio', { name: /Card/ }).checked).toBe(true)
  await userEvent.click(within(dialog).getByRole('radio', { name: /Cash/ }))
  await userEvent.clear(within(dialog).getByLabelText('Data'))
  await userEvent.type(within(dialog).getByLabelText('Data'), '2026-11-03')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Adaugă' }))

  expect(sentBody(fetchMock, '/api/food/2026-11/purchases')).toEqual({
    merchant: 'Lidl',
    amountBani: 8_450,
    spentOn: '2026-11-03',
    sourceId: 's2',
    note: null,
  })
})

test('a purchase opens for editing and can be deleted', async () => {
  const fetchMock = fakeServer({
    '/api/user/me': [200, testAccount],
    [at('/api/food/2026-11')]: [200, { ...november, purchases: [{ ...lidl, merchant: 'Piața Obor' }] }],
    'DELETE /api/food/purchases/p1': [200, { ok: true }],
  })
  renderPage('/mancare/11-26')
  await userEvent.click(await screen.findByRole('button', { name: /Piața Obor/ }))
  const dialog = screen.getByRole('dialog', { name: 'Editează cumpărătura' })
  expect(within(dialog).getByLabelText<HTMLInputElement>('Sumă (lei)').value).toBe('84,50')
  expect(within(dialog).getByLabelText<HTMLInputElement>('Numele magazinului').value).toBe('Piața Obor')

  await userEvent.click(within(dialog).getByRole('button', { name: 'Șterge cumpărătura' }))
  await userEvent.click(within(dialog).getByRole('button', { name: 'Da, șterge' }))
  expect(fetchMock.mock.calls.some(([path, init]) => path === '/api/food/purchases/p1' && init?.method === 'DELETE')).toBe(true)
})
