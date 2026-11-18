import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { App } from '../../App.tsx'
import { testAccount } from '../../test/account.ts'
import { renderWithProviders } from '../../test/render.tsx'
import { fakeServer, sentBody } from '../../test/server.ts'
import { todayDate } from '../budget/month-key.ts'
import type { Reminder } from './reminders-api.ts'

afterEach(() => {
  vi.unstubAllGlobals()
})

// A day `days` from today, in the browser's time zone.
function inDays(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return todayDate(date)
}

const itp: Reminder = {
  id: 'r1',
  kind: 'itp',
  name: 'ITP Logan',
  subject: 'B 123 ABC',
  dueDate: inDays(40),
  intervalMonths: 24,
  leadDays: [7, 30],
  notes: 'Service-ul din Berceni',
  isActive: true,
  createdAt: '2026-11-14T08:00:00.000Z',
}

const status = (emailEnabled = true): [number, unknown] => [200, { registrationsEnabled: true, emailEnabled }]
const renderPage = () => renderWithProviders(<App />, { path: '/scadente', withAuth: true })

test('with no reminders, says what they are for', async () => {
  fakeServer({ '/api/user/me': [200, testAccount], '/api/auth/status': status(), '/api/reminders': [200, []] })
  renderPage()

  expect(await screen.findByRole('heading', { name: 'Nicio scadență' })).toBeDefined()
  expect(screen.getByText(/primești un email înainte să expire/)).toBeDefined()
  expect(screen.queryByText(/Emailurile sunt oprite/)).toBeNull()
})

test('with email off, says the reminders show only here', async () => {
  fakeServer({ '/api/user/me': [200, testAccount], '/api/auth/status': status(false), '/api/reminders': [200, []] })
  renderPage()

  expect(await screen.findByText(/Emailurile sunt oprite pe acest server/)).toBeDefined()
  expect(screen.getByText(/vezi aici cât timp mai ai/)).toBeDefined()
})

test('shows each reminder with its type, subject, note and how long is left', async () => {
  const reminders: Reminder[] = [
    { ...itp, id: 'r1', name: 'RCA', kind: 'rca', subject: null, notes: null, dueDate: inDays(-2) },
    { ...itp, id: 'r2', name: 'Rovinietă', kind: 'rovinieta', subject: null, notes: null, dueDate: inDays(5) },
    { ...itp, id: 'r3' },
    { ...itp, id: 'r4', name: 'Extinctor', kind: 'extinctor', subject: null, notes: null, isActive: false },
  ]
  fakeServer({ '/api/user/me': [200, testAccount], '/api/auth/status': status(), '/api/reminders': [200, reminders] })
  renderPage()

  const list = await screen.findByRole('list')
  const rows = within(list).getAllByRole('listitem')
  expect(rows.map((row) => within(row).getByRole('heading').textContent)).toEqual(['RCA', 'Rovinietă', 'ITP Logan', 'Extinctoroprit'])
  expect(within(rows[0] as HTMLElement).getByText('Expirat de 2 zile')).toBeDefined()
  expect(within(rows[1] as HTMLElement).getByText('În 5 zile')).toBeDefined()
  expect(within(rows[2] as HTMLElement).getByText('ITP · B 123 ABC')).toBeDefined()
  expect(within(rows[2] as HTMLElement).getByText('În 40 de zile')).toBeDefined()
  expect(within(rows[2] as HTMLElement).getByText('Service-ul din Berceni')).toBeDefined()
  expect(within(rows[3] as HTMLElement).getByText('—')).toBeDefined()
  // The overdue one and the one within its lead days.
  expect(screen.getByText('2 scadențe au nevoie de atenție acum.')).toBeDefined()
})

test('deletes a reminder after asking', async () => {
  let reminders = [itp]
  const fetchMock = fakeServer({
    '/api/user/me': [200, testAccount],
    '/api/auth/status': status(),
    '/api/reminders': () => Promise.resolve(new Response(JSON.stringify(reminders))),
    'DELETE /api/reminders/r1': () => {
      reminders = []
      return Promise.resolve(new Response(JSON.stringify({ ok: true })))
    },
  })
  renderPage()

  await userEvent.click(await screen.findByRole('button', { name: 'Șterge ITP Logan' }))
  const dialog = screen.getByRole('dialog', { name: 'Ștergi ITP Logan?' })
  await userEvent.click(within(dialog).getByRole('button', { name: 'Șterge' }))

  expect(await screen.findByRole('heading', { name: 'Nicio scadență' })).toBeDefined()
  expect(fetchMock.mock.calls.some(([path, init]) => path === '/api/reminders/r1' && init?.method === 'DELETE')).toBe(true)
})

test('a list that cannot be loaded can be asked for again', async () => {
  let fail = true
  fakeServer({
    '/api/user/me': [200, testAccount],
    '/api/auth/status': status(),
    '/api/reminders': () => {
      const answer = fail ? [500, { error: { code: 'internal_error', message: 'x' } }] : [200, [itp]]
      fail = false
      return Promise.resolve(new Response(JSON.stringify(answer[1]), { status: answer[0] as number }))
    },
  })
  renderPage()

  expect(await screen.findByText(/Scadențele nu au putut fi încărcate/)).toBeDefined()
  await userEvent.click(screen.getByRole('button', { name: 'Încearcă din nou' }))
  expect(await screen.findByText('ITP Logan')).toBeDefined()
})

describe('the reminder dialog', () => {
  const serve = (reminders: Reminder[]) =>
    fakeServer({
      '/api/user/me': [200, testAccount],
      '/api/auth/status': status(),
      '/api/reminders': [200, reminders],
      'POST /api/reminders': [201, itp],
      'PATCH /api/reminders/r1': [200, itp],
    })

  test('adds a reminder with the defaults of the type picked', async () => {
    const fetchMock = serve([])
    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: 'Adaugă prima scadență' }))
    const dialog = screen.getByRole('dialog', { name: 'Adaugă o scadență' })
    await userEvent.click(within(dialog).getByRole('radio', { name: 'RCA' }))
    expect(within(dialog).getByLabelText<HTMLInputElement>('Nume').value).toBe('RCA')
    expect(within(dialog).getByLabelText<HTMLSelectElement>('Se repetă').value).toBe('12')
    expect(within(dialog).getByRole<HTMLInputElement>('checkbox', { name: '30 de zile' }).checked).toBe(true)

    await userEvent.type(within(dialog).getByLabelText('Pentru (opțional)'), 'B 123 ABC')
    await userEvent.type(within(dialog).getByLabelText('Expiră la'), inDays(100))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Adaugă' }))

    await waitFor(() => { expect(screen.queryByRole('dialog')).toBeNull() })
    expect(sentBody(fetchMock, '/api/reminders')).toEqual({
      kind: 'rca',
      name: 'RCA',
      subject: 'B 123 ABC',
      dueDate: inDays(100),
      intervalMonths: 12,
      leadDays: [7, 30],
      notes: null,
    })
  })

  test('asks for a name and a date', async () => {
    const fetchMock = serve([])
    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: 'Adaugă prima scadență' }))
    const dialog = screen.getByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Adaugă' }))

    expect(within(dialog).getByText('Scrie un nume.')).toBeDefined()
    expect(within(dialog).getByText('Alege data la care expiră.')).toBeDefined()
    expect(sentBody(fetchMock, '/api/reminders')).toBeUndefined()
  })

  test('keeps between one and five warnings', async () => {
    serve([])
    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: 'Adaugă prima scadență' }))
    const dialog = screen.getByRole('dialog')
    const chip = (name: string) => within(dialog).getByRole<HTMLInputElement>('checkbox', { name })
    // ITP starts with 7 and 30; down to one, which stays.
    await userEvent.click(chip('30 de zile'))
    await userEvent.click(chip('7 zile'))
    expect(chip('7 zile').checked).toBe(true)

    for (const name of ['60 de zile', '30 de zile', '14 zile', '3 zile']) await userEvent.click(chip(name))
    expect(chip('1 zi').disabled).toBe(true)
  })

  test('edits a reminder and can turn it off', async () => {
    const fetchMock = serve([itp])
    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: 'Editează ITP Logan' }))
    const dialog = screen.getByRole('dialog', { name: 'Editează scadența' })
    expect(within(dialog).getByLabelText<HTMLSelectElement>('Se repetă').value).toBe('24')
    await userEvent.click(within(dialog).getByRole('switch', { name: 'Activă' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvează' }))

    await waitFor(() => { expect(screen.queryByRole('dialog')).toBeNull() })
    expect(sentBody(fetchMock, '/api/reminders/r1')).toEqual({
      kind: 'itp',
      name: 'ITP Logan',
      subject: 'B 123 ABC',
      dueDate: itp.dueDate,
      intervalMonths: 24,
      leadDays: [7, 30],
      notes: 'Service-ul din Berceni',
      isActive: false,
    })
  })
})
