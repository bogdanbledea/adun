import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { App } from '../../App.tsx'
import { testAccount } from '../../test/account.ts'
import { renderWithProviders } from '../../test/render.tsx'
import { fakeServer, sentBody } from '../../test/server.ts'

afterEach(() => {
  vi.unstubAllGlobals()
})

const renderApp = (path = '/setari') => renderWithProviders(<App />, { path, withAuth: true })

test('opens from the account menu', async () => {
  fakeServer({ '/api/user/me': [200, testAccount] })
  renderApp('/buget')
  await userEvent.click(await screen.findByRole('button', { name: 'Meniu cont' }))
  await userEvent.click(screen.getByRole('menuitem', { name: 'Setări' }))
  expect(screen.getByRole('heading', { level: 1, name: 'Setări' })).toBeDefined()
})

describe('the account section', () => {
  test('saves a new name, trimmed, and the header follows', async () => {
    const renamed = { ...testAccount, displayName: 'Maria Ionescu' }
    const fetchMock = fakeServer({ 'GET /api/user/me': [200, testAccount], 'PATCH /api/user/me': [200, renamed] })
    renderApp()
    expect(await screen.findByRole('button', { name: 'Meniu cont' })).toHaveProperty('textContent', 'AP')

    const name = screen.getByLabelText('Nume afișat')
    await userEvent.clear(name)
    await userEvent.type(name, '  Maria Ionescu ')
    await userEvent.click(screen.getByRole('button', { name: 'Salvează' }))

    expect(await screen.findByText('Salvat.')).toBeDefined()
    expect(sentBody(fetchMock, '/api/user/me')).toEqual({ displayName: 'Maria Ionescu' })
    expect(screen.getByRole('button', { name: 'Meniu cont' }).textContent).toBe('MI')
  })

  test('asks for a name instead of saving an empty one', async () => {
    const fetchMock = fakeServer({ '/api/user/me': [200, testAccount] })
    renderApp()
    await userEvent.clear(await screen.findByLabelText('Nume afișat'))
    await userEvent.type(screen.getByLabelText('Nume afișat'), '   ')
    await userEvent.click(screen.getByRole('button', { name: 'Salvează' }))
    expect(screen.getByText('Scrie un nume.')).toBeDefined()
    expect(fetchMock.mock.calls.some((args) => args[1]?.method === 'PATCH')).toBe(false)
  })

  test('shows the email address, which cannot be changed', async () => {
    fakeServer({ '/api/user/me': [200, testAccount] })
    renderApp()
    const email = await screen.findByLabelText('Email')
    expect(email).toHaveProperty('value', 'ana@example.com')
    expect(email).toHaveProperty('readOnly', true)
  })

  test('shows what went wrong when saving fails', async () => {
    fakeServer({
      'GET /api/user/me': [200, testAccount],
      'PATCH /api/user/me': [400, { error: { code: 'invalid_input', message: 'Invalid value: displayName.' } }],
    })
    renderApp()
    await userEvent.type(await screen.findByLabelText('Nume afișat'), 'x')
    await userEvent.click(screen.getByRole('button', { name: 'Salvează' }))
    expect(await screen.findByText('Datele trimise nu sunt valide.')).toBeDefined()
  })
})

describe('the password section', () => {
  const NEW_PASSWORD = 'Alta-parola-buna-2'

  async function openForm() {
    await userEvent.click(await screen.findByRole('button', { name: 'Schimbă parola' }))
  }

  async function fill(current: string, next: string, confirm = next) {
    await userEvent.type(screen.getByLabelText('Parola actuală'), current)
    await userEvent.type(screen.getByLabelText('Parolă (min. 12 caractere)'), next)
    await userEvent.type(screen.getByLabelText('Confirmă parola'), confirm)
    await userEvent.click(screen.getByRole('button', { name: 'Schimbă parola' }))
  }

  test('changes the password, in the language shown, and says the other devices were signed out', async () => {
    const fetchMock = fakeServer({ '/api/user/me': [200, testAccount], '/api/auth/change-password': [200, { ok: true }] })
    renderApp()
    await openForm()
    await fill('Corect-cal-baterie-1', NEW_PASSWORD)

    expect(await screen.findByText('Parola a fost schimbată. Celelalte dispozitive au ieșit din cont.')).toBeDefined()
    expect(sentBody(fetchMock, '/api/auth/change-password')).toEqual({
      currentPassword: 'Corect-cal-baterie-1',
      newPassword: NEW_PASSWORD,
      language: 'ro',
    })
    expect(screen.queryByLabelText('Parola actuală')).toBeNull()
  })

  test('checks the new password before sending it', async () => {
    const fetchMock = fakeServer({ '/api/user/me': [200, testAccount] })
    renderApp()
    await openForm()
    await fill('Corect-cal-baterie-1', 'scurta')
    expect(screen.getByText('Parola trebuie să aibă cel puțin 12 caractere.')).toBeDefined()
    await userEvent.clear(screen.getByLabelText('Parolă (min. 12 caractere)'))
    await userEvent.clear(screen.getByLabelText('Confirmă parola'))
    await userEvent.type(screen.getByLabelText('Parolă (min. 12 caractere)'), NEW_PASSWORD)
    await userEvent.type(screen.getByLabelText('Confirmă parola'), 'Alta-parola-buna-3')
    await userEvent.click(screen.getByRole('button', { name: 'Schimbă parola' }))
    expect(screen.getByText('Parolele nu se potrivesc.')).toBeDefined()
    expect(fetchMock.mock.calls.some((args) => args[0] === '/api/auth/change-password')).toBe(false)
  })

  test('says so when the current password is wrong, and stays signed in', async () => {
    fakeServer({
      '/api/user/me': [200, testAccount],
      '/api/auth/change-password': [401, { error: { code: 'wrong_password', message: 'The password is not correct.' } }],
    })
    renderApp()
    await openForm()
    await fill('Gresit-dar-lung-1', NEW_PASSWORD)
    expect(await screen.findByText('Parola nu este corectă.')).toBeDefined()
    expect(screen.getByRole('heading', { level: 1, name: 'Setări' })).toBeDefined()
  })

  test('cancel closes the form and forgets what was typed', async () => {
    fakeServer({ '/api/user/me': [200, testAccount] })
    renderApp()
    await openForm()
    await userEvent.type(screen.getByLabelText('Parola actuală'), 'ceva')
    const section = screen.getByRole('region', { name: 'Parolă' })
    await userEvent.click(within(section).getByRole('button', { name: 'Renunță' }))
    await openForm()
    expect(screen.getByLabelText('Parola actuală')).toHaveProperty('value', '')
  })
})

describe('the activity section', () => {
  const entry = (id: number, action: string) => ({ id, action, createdAt: '2026-11-18T12:05:00.000Z' })

  test('lists what changed, newest first, and shows more on request', async () => {
    const first = Array.from({ length: 50 }, (_, i) => entry(100 - i, 'account.renamed'))
    const fetchMock = fakeServer({
      '/api/user/me': [200, testAccount],
      '/api/activity?limit=50': [200, first],
      '/api/activity?limit=50&offset=50': [200, [entry(1, 'account.password_changed'), entry(0, 'budget.something_new')]],
    })
    renderApp()
    const section = await screen.findByRole('region', { name: 'Activitate' })
    expect((await within(section).findAllByText('Numele afișat a fost schimbat')).length).toBe(50)

    await userEvent.click(within(section).getByRole('button', { name: 'Arată mai multe' }))
    expect(await within(section).findByText('Parola a fost schimbată')).toBeDefined()
    // An action without a text shows its name.
    expect(within(section).getByText('budget.something_new')).toBeDefined()
    expect(within(section).queryByRole('button', { name: 'Arată mai multe' })).toBeNull()
    expect(fetchMock.mock.calls.filter((args) => args[0].startsWith('/api/activity')).length).toBe(2)
  })

  test('says when there is nothing yet, with nothing to erase', async () => {
    fakeServer({ '/api/user/me': [200, testAccount], '/api/activity?limit=50': [200, []] })
    renderApp()
    expect(await screen.findByText('Nimic încă.')).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Șterge istoricul' })).toBeNull()
  })

  test('erases the history after asking once more', async () => {
    const fetchMock = fakeServer({
      '/api/user/me': [200, testAccount],
      'GET /api/activity?limit=50': [200, [entry(1, 'account.renamed')]],
      'DELETE /api/activity': [200, { ok: true }],
    })
    renderApp()
    await userEvent.click(await screen.findByRole('button', { name: 'Șterge istoricul' }))
    expect(fetchMock.mock.calls.some((args) => args[1]?.method === 'DELETE')).toBe(false)
    await userEvent.click(screen.getByRole('button', { name: 'Da, șterge' }))
    expect(await screen.findByText('Nimic încă.')).toBeDefined()
    expect(fetchMock.mock.calls.some((args) => args[0] === '/api/activity' && args[1]?.method === 'DELETE')).toBe(true)
  })

  test('offers to try again when the list cannot be loaded', async () => {
    fakeServer({ '/api/user/me': [200, testAccount], '/api/activity?limit=50': [500, { error: { code: 'internal_error', message: 'x' } }] })
    renderApp()
    expect(await screen.findByText('A apărut o eroare neașteptată.')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Încearcă din nou' })).toBeDefined()
  })
})

describe('deleting the account', () => {
  async function deleteWith(password: string) {
    await userEvent.click(await screen.findByRole('button', { name: 'Șterge contul' }))
    await userEvent.type(screen.getByLabelText('Parola, pentru confirmare'), password)
    await userEvent.click(screen.getByRole('button', { name: 'Șterge definitiv' }))
  }

  test('confirms the password, deletes the account and signs out', async () => {
    const fetchMock = fakeServer({
      '/api/user/me': [200, testAccount],
      '/api/auth/confirm-password': [200, { ok: true }],
      'DELETE /api/user': [200, { ok: true }],
      '/api/auth/logout': [200, { ok: true }],
    })
    renderApp()
    await deleteWith('Corect-cal-baterie-1')

    expect(await screen.findByRole('heading', { name: 'Autentificare' })).toBeDefined()
    expect(sentBody(fetchMock, '/api/auth/confirm-password')).toEqual({ password: 'Corect-cal-baterie-1' })
    const paths = fetchMock.mock.calls.map((args) => `${args[1]?.method ?? 'GET'} ${args[0]}`)
    expect(paths.indexOf('DELETE /api/user')).toBeGreaterThan(paths.indexOf('POST /api/auth/confirm-password'))
  })

  test('with a wrong password, deletes nothing and says so', async () => {
    const fetchMock = fakeServer({
      '/api/user/me': [200, testAccount],
      '/api/auth/confirm-password': [401, { error: { code: 'wrong_password', message: 'The password is not correct.' } }],
    })
    renderApp()
    await deleteWith('Gresit-dar-lung-1')
    expect(await screen.findByText('Parola nu este corectă.')).toBeDefined()
    expect(fetchMock.mock.calls.some((args) => args[0] === '/api/user' && args[1]?.method === 'DELETE')).toBe(false)
    expect(screen.getByRole('heading', { level: 1, name: 'Setări' })).toBeDefined()
  })
})
