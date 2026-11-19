import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { App } from '../../App.tsx'
import { testAccount } from '../../test/account.ts'
import { renderWithProviders } from '../../test/render.tsx'
import { fakeServer, sentBody } from '../../test/server.ts'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const renderApp = (path = '/setari') => renderWithProviders(<App />, { path, withAuth: true })

test('opens from the account menu', async () => {
  fakeServer({ '/api/user/me': [200, testAccount] })
  renderApp('/buget')
  await userEvent.click(await screen.findByRole('button', { name: 'Meniu cont' }))
  await userEvent.click(screen.getByRole('menuitem', { name: 'Setări' }))
  expect(screen.getByRole('heading', { level: 1, name: 'Setări' })).toBeDefined()
})

test('keeps the activity history on a card of its own, apart from the settings', async () => {
  fakeServer({ '/api/user/me': [200, testAccount], '/api/activity?limit=50': [200, []] })
  renderApp()
  const history = (await screen.findByRole('region', { name: 'Activitate recentă' })).closest('.card')
  const account = screen.getByRole('region', { name: 'Cont' }).closest('.card')
  expect(history).not.toBeNull()
  expect(history).not.toBe(account)
  expect(within(history as HTMLElement).getAllByRole('region').length).toBe(1)
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

describe('the security section', () => {
  const NEW_PASSWORD = 'Alta-parola-buna-2'

  async function openDialog() {
    await userEvent.click(await screen.findByRole('button', { name: 'Schimbă parola' }))
    return screen.getByRole('dialog', { name: 'Schimbă parola' })
  }

  async function fill(dialog: HTMLElement, current: string, next: string, confirm = next) {
    await userEvent.type(within(dialog).getByLabelText('Parola actuală'), current)
    await userEvent.type(within(dialog).getByLabelText('Parolă (min. 12 caractere)'), next)
    await userEvent.type(within(dialog).getByLabelText('Confirmă parola'), confirm)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Schimbă parola' }))
  }

  test('changes the password, in the language shown, and says the other sessions were ended', async () => {
    const fetchMock = fakeServer({ '/api/user/me': [200, testAccount], '/api/auth/change-password': [200, { ok: true }] })
    renderApp()
    await fill(await openDialog(), 'Corect-cal-baterie-1', NEW_PASSWORD)

    expect(await screen.findByText('Parola a fost schimbată. Celelalte sesiuni au fost închise.')).toBeDefined()
    expect(sentBody(fetchMock, '/api/auth/change-password')).toEqual({
      currentPassword: 'Corect-cal-baterie-1',
      newPassword: NEW_PASSWORD,
      language: 'ro',
    })
    expect(screen.queryByRole('dialog', { name: 'Schimbă parola' })).toBeNull()
  })

  test('checks the new password before sending it', async () => {
    const fetchMock = fakeServer({ '/api/user/me': [200, testAccount] })
    renderApp()
    const dialog = await openDialog()
    await fill(dialog, 'Corect-cal-baterie-1', 'scurta')
    expect(within(dialog).getByText('Parola trebuie să aibă cel puțin 12 caractere.')).toBeDefined()
    await userEvent.clear(within(dialog).getByLabelText('Parolă (min. 12 caractere)'))
    await userEvent.clear(within(dialog).getByLabelText('Confirmă parola'))
    await userEvent.type(within(dialog).getByLabelText('Parolă (min. 12 caractere)'), NEW_PASSWORD)
    await userEvent.type(within(dialog).getByLabelText('Confirmă parola'), 'Alta-parola-buna-3')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Schimbă parola' }))
    expect(within(dialog).getByText('Parolele nu se potrivesc.')).toBeDefined()
    expect(fetchMock.mock.calls.some((args) => args[0] === '/api/auth/change-password')).toBe(false)
  })

  test('says so in the dialog when the current password is wrong', async () => {
    fakeServer({
      '/api/user/me': [200, testAccount],
      '/api/auth/change-password': [401, { error: { code: 'wrong_password', message: 'The password is not correct.' } }],
    })
    renderApp()
    const dialog = await openDialog()
    await fill(dialog, 'Gresit-dar-lung-1', NEW_PASSWORD)
    expect(await within(dialog).findByText('Parola nu este corectă.')).toBeDefined()
  })

  test('cancel closes the dialog and forgets what was typed', async () => {
    fakeServer({ '/api/user/me': [200, testAccount] })
    renderApp()
    const dialog = await openDialog()
    await userEvent.type(within(dialog).getByLabelText('Parola actuală'), 'ceva')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Anulează' }))
    expect(screen.queryByRole('dialog', { name: 'Schimbă parola' })).toBeNull()
    expect(within(await openDialog()).getByLabelText('Parola actuală')).toHaveProperty('value', '')
  })

  test('signs out on every device after asking', async () => {
    const fetchMock = fakeServer({ '/api/user/me': [200, testAccount], '/api/auth/logout-all': [200, { ok: true }] })
    renderApp()
    await userEvent.click(await screen.findByRole('button', { name: 'Ieși de peste tot' }))
    expect(fetchMock.mock.calls.some(([path]) => path === '/api/auth/logout-all')).toBe(false)
    const dialog = screen.getByRole('dialog', { name: 'Ieși de pe toate dispozitivele?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Ieși de peste tot' }))
    expect(await screen.findByRole('heading', { name: 'Autentificare' })).toBeDefined()
    expect(fetchMock.mock.calls.some(([path]) => path === '/api/auth/logout-all')).toBe(true)
  })

  test('if signing out everywhere fails, this browser stays signed in and says so', async () => {
    fakeServer({ '/api/user/me': [200, testAccount], '/api/auth/logout-all': () => Promise.reject(new TypeError('offline')) })
    renderApp()
    await userEvent.click(await screen.findByRole('button', { name: 'Ieși de peste tot' }))
    const dialog = screen.getByRole('dialog', { name: 'Ieși de pe toate dispozitivele?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Ieși de peste tot' }))
    const section = screen.getByRole('region', { name: 'Securitate' })
    expect(await within(section).findByRole('alert')).toBeDefined()
    expect(screen.getByRole('heading', { level: 1, name: 'Setări' })).toBeDefined()
  })
})

describe('the activity section', () => {
  const entry = (id: number, action: string, metadata: Record<string, unknown> | null = null) => ({
    id,
    action,
    metadata,
    createdAt: '2026-11-18T12:05:00.000Z',
  })

  test('lists what changed, newest first, and shows more on request', async () => {
    const first = Array.from({ length: 50 }, (_, i) => entry(100 - i, 'account.renamed'))
    const fetchMock = fakeServer({
      '/api/user/me': [200, testAccount],
      '/api/activity?limit=50': [200, first],
      '/api/activity?limit=50&offset=50': [200, [entry(1, 'account.password_changed'), entry(0, 'budget.something_new')]],
    })
    renderApp()
    const section = await screen.findByRole('region', { name: 'Activitate recentă' })
    expect((await within(section).findAllByText('Numele afișat a fost schimbat')).length).toBe(50)

    await userEvent.click(within(section).getByRole('button', { name: 'Arată mai multe' }))
    expect(await within(section).findByText('Parola a fost schimbată')).toBeDefined()
    // An action without a text shows its name.
    expect(within(section).getByText('budget.something_new')).toBeDefined()
    expect(within(section).queryByRole('button', { name: 'Arată mai multe' })).toBeNull()
    expect(fetchMock.mock.calls.filter((args) => args[0].startsWith('/api/activity')).length).toBe(2)
  })

  test('shows what a budget change was about', async () => {
    const rent = { description: 'Chirie', category: 'Casă', type: 'expense', amountBani: 150_000, monthKey: '2026-11' }
    fakeServer({
      '/api/user/me': [200, testAccount],
      '/api/activity?limit=50': [
        200,
        [
          entry(4, 'entry.moved', { ...rent, monthKey: '2026-12', fromMonthKey: '2026-11' }),
          entry(3, 'entry.created', { ...rent, description: 'Salariu', category: 'Venituri', type: 'income' }),
          entry(2, 'entry.deleted', rent),
          entry(1, 'month.created', { monthKey: '2026-11' }),
        ],
      ],
    })
    renderApp()
    const section = await screen.findByRole('region', { name: 'Activitate recentă' })
    const items = await within(section).findAllByRole('listitem')
    expect(items.map((item) => item.children[1]?.textContent)).toEqual([
      'Înregistrare mutată în altă lunăChirie · Casă · 1.500lei · Noiembrie 2026 → Decembrie 2026',
      'Înregistrare adăugatăSalariu · Venituri · +1.500lei · Noiembrie 2026',
      'Înregistrare ștearsăChirie · Casă · 1.500lei · Noiembrie 2026',
      'Lună adăugată în bugetNoiembrie 2026',
    ])
  })

  test('shows what a reminder change was about', async () => {
    fakeServer({
      '/api/user/me': [200, testAccount],
      '/api/activity?limit=50': [
        200,
        [
          entry(4, 'reminder.deleted', { name: 'Gaze', kind: 'revizie_gaz' }),
          entry(3, 'reminder.renewed', { name: 'ITP Logan', from: '2026-12-01', to: '2028-12-01' }),
          entry(2, 'reminder.updated', { name: 'ITP Logan' }),
          entry(1, 'reminder.created', { name: 'ITP Logan', kind: 'itp', dueDate: '2026-12-01' }),
        ],
      ],
    })
    renderApp()
    const section = await screen.findByRole('region', { name: 'Activitate recentă' })
    const items = await within(section).findAllByRole('listitem')
    expect(items.map((item) => item.children[1]?.textContent)).toEqual([
      'Scadență ștearsăGaze · Revizie gaze',
      'Scadență reînnoităITP Logan · 1 decembrie 2026 → 1 decembrie 2028',
      'Scadență modificatăITP Logan',
      'Scadență creatăITP Logan · ITP · 1 decembrie 2026',
    ])
  })

  test('hides the amounts in the history with the others', async () => {
    localStorage.setItem('amountsHidden', 'true')
    fakeServer({
      '/api/user/me': [200, testAccount],
      '/api/activity?limit=50': [200, [entry(1, 'plan.created', { name: 'Telefon', installments: 6, totalBani: 360_000 })]],
    })
    renderApp()
    const section = await screen.findByRole('region', { name: 'Activitate recentă' })
    const [item] = await within(section).findAllByRole('listitem')
    expect(item?.querySelector('.amount-masked')?.textContent).toBe('3.600')
    expect(within(section).getByText('sumă ascunsă')).toBeDefined()
  })

  test('shows where a month’s entries were copied from, and the template’s entries', async () => {
    fakeServer({
      '/api/user/me': [200, testAccount],
      '/api/activity?limit=50': [
        200,
        [
          entry(4, 'entry.created', { description: 'Chirie', category: 'Casă', type: 'expense', amountBani: 150_000, monthKey: null }),
          entry(3, 'month.imported', { monthKey: '2026-12', from: 'template', entries: 2 }),
          entry(2, 'month.created', { monthKey: '2026-12', from: '2026-11', entries: 5 }),
          entry(1, 'month.deleted', { monthKey: '2026-10', entries: 3 }),
        ],
      ],
    })
    renderApp()
    const section = await screen.findByRole('region', { name: 'Activitate recentă' })
    const items = await within(section).findAllByRole('listitem')
    expect(items.map((item) => item.children[1]?.textContent)).toEqual([
      'Înregistrare adăugatăChirie · Casă · 1.500lei · Șablon',
      'Intrări importateDecembrie 2026 · din Șablon · intrări: 2',
      'Lună adăugată în bugetDecembrie 2026 · din Noiembrie 2026 · intrări: 5',
      'Lună ștearsă din bugetOctombrie 2026',
    ])
  })

  test('says when there is nothing yet', async () => {
    fakeServer({ '/api/user/me': [200, testAccount], '/api/activity?limit=50': [200, []] })
    renderApp()
    const section = await screen.findByRole('region', { name: 'Activitate recentă' })
    expect(await within(section).findByText('Nimic încă.')).toBeDefined()
  })

  test('offers to try again when the list cannot be loaded', async () => {
    fakeServer({
      '/api/user/me': [200, testAccount],
      '/api/family': [200, null],
      '/api/activity?limit=50': [500, { error: { code: 'internal_error', message: 'x' } }],
    })
    renderApp()
    expect(await screen.findByText('A apărut o eroare neașteptată.')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Încearcă din nou' })).toBeDefined()
  })
})

describe('deleting the account', () => {
  async function deleteWith(password: string) {
    await userEvent.click(await screen.findByRole('button', { name: 'Șterge contul' }))
    const dialog = screen.getByRole('dialog', { name: 'Șterge contul' })
    await userEvent.type(within(dialog).getByLabelText('Scrie ȘTERGE pentru a confirma'), 'ȘTERGE')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Șterge definitiv' }))
    const confirm = screen.getByRole('dialog', { name: 'Confirmă parola' })
    await userEvent.type(within(confirm).getByLabelText('Parolă'), password)
    await userEvent.click(within(confirm).getByRole('button', { name: 'Continuă' }))
  }

  test('asks for the word before anything else', async () => {
    fakeServer({ '/api/user/me': [200, testAccount] })
    renderApp()
    await userEvent.click(await screen.findByRole('button', { name: 'Șterge contul' }))
    const dialog = screen.getByRole('dialog', { name: 'Șterge contul' })
    const button = within(dialog).getByRole('button', { name: 'Șterge definitiv' })
    expect(button).toHaveProperty('disabled', true)
    await userEvent.type(within(dialog).getByLabelText('Scrie ȘTERGE pentru a confirma'), 'șterge')
    expect(button).toHaveProperty('disabled', true)
    await userEvent.clear(within(dialog).getByLabelText('Scrie ȘTERGE pentru a confirma'))
    await userEvent.type(within(dialog).getByLabelText('Scrie ȘTERGE pentru a confirma'), 'ȘTERGE')
    expect(button).toHaveProperty('disabled', false)
  })

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
    const confirm = screen.getByRole('dialog', { name: 'Confirmă parola' })
    expect(await within(confirm).findByText('Parola nu este corectă.')).toBeDefined()
    expect(fetchMock.mock.calls.some((args) => args[0] === '/api/user' && args[1]?.method === 'DELETE')).toBe(false)
  })

  test('cancelling the password goes back to the first dialog', async () => {
    fakeServer({ '/api/user/me': [200, testAccount] })
    renderApp()
    await userEvent.click(await screen.findByRole('button', { name: 'Șterge contul' }))
    const dialog = screen.getByRole('dialog', { name: 'Șterge contul' })
    await userEvent.type(within(dialog).getByLabelText('Scrie ȘTERGE pentru a confirma'), 'ȘTERGE')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Șterge definitiv' }))
    const confirm = screen.getByRole('dialog', { name: 'Confirmă parola' })
    await userEvent.click(within(confirm).getByRole('button', { name: 'Anulează' }))
    expect(screen.queryByRole('dialog', { name: 'Confirmă parola' })).toBeNull()
    expect(screen.getByRole('dialog', { name: 'Șterge contul' })).toBeDefined()
  })
})

describe('my data', () => {
  test('clears the activity history after asking, and loads it again', async () => {
    const fetchMock = fakeServer({
      '/api/user/me': [200, testAccount],
      'GET /api/activity?limit=50': [200, []],
      'DELETE /api/activity': [200, { ok: true }],
    })
    renderApp()
    await userEvent.click(await screen.findByRole('button', { name: 'Șterge istoricul' }))
    const dialog = screen.getByRole('dialog', { name: 'Ștergi istoricul activității?' })
    expect(fetchMock.mock.calls.some((args) => args[1]?.method === 'DELETE')).toBe(false)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Șterge istoricul' }))

    expect(await screen.findByText('Istoricul activității a fost șters.')).toBeDefined()
    expect(fetchMock.mock.calls.some((args) => args[0] === '/api/activity' && args[1]?.method === 'DELETE')).toBe(true)
    await vi.waitFor(() => {
      expect(fetchMock.mock.calls.filter((args) => args[0] === '/api/activity?limit=50').length).toBe(2)
    })
  })

  test('exports after the password, and saves the file', async () => {
    const file = { format: 'adun-export', version: 1 }
    const fetchMock = fakeServer({
      '/api/user/me': [200, testAccount],
      '/api/auth/confirm-password': [200, { ok: true }],
      'POST /api/data/export': [200, file],
      '/api/activity?limit=50': [200, []],
    })
    const createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:export')
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }))
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    renderApp()

    await userEvent.click(await screen.findByRole('button', { name: 'Exportă' }))
    const dialog = screen.getByRole('dialog', { name: 'Confirmă parola' })
    await userEvent.type(within(dialog).getByLabelText('Parolă'), 'Corect-cal-baterie-1')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Continuă' }))

    expect(await screen.findByText('Fișierul cu datele tale a fost descărcat.')).toBeDefined()
    expect(sentBody(fetchMock, '/api/auth/confirm-password')).toEqual({ password: 'Corect-cal-baterie-1' })
    const paths = fetchMock.mock.calls.map((args) => `${args[1]?.method ?? 'GET'} ${args[0]}`)
    expect(paths.indexOf('POST /api/data/export')).toBeGreaterThan(paths.indexOf('POST /api/auth/confirm-password'))
    expect(click).toHaveBeenCalledOnce()
    expect(JSON.parse(await (createObjectURL.mock.calls[0]?.[0] as Blob).text())).toEqual(file)
    click.mockRestore()
  })

  test('with a wrong password, exports nothing and says so in the dialog', async () => {
    const fetchMock = fakeServer({
      '/api/user/me': [200, testAccount],
      '/api/auth/confirm-password': [401, { error: { code: 'wrong_password', message: 'The password is not correct.' } }],
    })
    renderApp()
    await userEvent.click(await screen.findByRole('button', { name: 'Exportă' }))
    const dialog = screen.getByRole('dialog', { name: 'Confirmă parola' })
    await userEvent.type(within(dialog).getByLabelText('Parolă'), 'Gresit-dar-lung-1')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Continuă' }))
    expect(await within(dialog).findByText('Parola nu este corectă.')).toBeDefined()
    expect(fetchMock.mock.calls.some((args) => args[0] === '/api/data/export')).toBe(false)
  })

  test('imports the chosen file and loads the account again', async () => {
    const file = { format: 'adun-export', version: 1, months: [] }
    const fetchMock = fakeServer({
      '/api/user/me': [200, testAccount],
      'POST /api/data/import': [200, { ok: true, imported: { months: 0, plans: 0, reminders: 0, foodMonths: 0 } }],
      '/api/activity?limit=50': [200, []],
    })
    renderApp()
    await screen.findByRole('button', { name: 'Importă' })
    await userEvent.upload(screen.getByLabelText('Importă datele'), new File([JSON.stringify(file)], 'adun.json', { type: 'application/json' }))

    expect(await screen.findByText('Datele din fișier au fost importate.')).toBeDefined()
    expect(sentBody(fetchMock, '/api/data/import')).toEqual(file)
    expect(fetchMock.mock.calls.filter((args) => args[0] === '/api/user/me')).toHaveLength(2)
  })

  test('the history says what an import brought in', async () => {
    fakeServer({
      '/api/user/me': [200, testAccount],
      '/api/activity?limit=50': [
        200,
        [
          { id: 2, action: 'data.imported', metadata: { months: 4, plans: 1, reminders: 2, foodMonths: 3 }, createdAt: '2026-11-18T10:00:00.000Z' },
          { id: 1, action: 'data.exported', metadata: null, createdAt: '2026-11-18T09:00:00.000Z' },
        ],
      ],
    })
    renderApp()
    const history = (await screen.findByText('Date importate')).closest('ul') as HTMLElement
    expect(within(history).getAllByRole('listitem').map((item) => item.children[1]?.textContent)).toEqual([
      'Date importateluni: 4, planuri: 1, scadențe: 2, luni de mâncare: 3',
      'Date exportate',
    ])
  })

  test('says why a file was refused, and sends nothing that is not JSON', async () => {
    const fetchMock = fakeServer({
      '/api/user/me': [200, testAccount],
      'POST /api/data/import': [409, { error: { code: 'account_not_empty', message: 'Import works only…' } }],
    })
    renderApp()
    await screen.findByRole('button', { name: 'Importă' })
    const input = screen.getByLabelText('Importă datele')
    await userEvent.upload(input, new File(['{}'], 'adun.json', { type: 'application/json' }))
    expect(await screen.findByText('Importul merge doar într-un cont fără date, care nu face parte dintr-o familie.')).toBeDefined()

    await userEvent.upload(input, new File(['not json'], 'adun.json', { type: 'application/json' }))
    expect(await screen.findByText('Fișierul nu este un export Adun valid.')).toBeDefined()
    expect(fetchMock.mock.calls.filter((args) => args[0] === '/api/data/import')).toHaveLength(1)
  })
})

test('food and calendar actions in the history say what they were about', async () => {
  const entry = (id: number, action: string, metadata: Record<string, string | number>) => ({
    id,
    action,
    metadata,
    createdAt: '2026-11-18T10:00:00.000Z',
  })
  fakeServer({
    '/api/user/me': [200, testAccount],
    '/api/activity?limit=50': [
      200,
      [
        entry(1, 'food.purchase_added', { monthKey: '2026-11', merchant: 'Lidl', amountBani: 8_450 }),
        entry(2, 'food.budget_set', { monthKey: '2026-11', totalBani: 210_000, sources: 2 }),
        entry(3, 'food.purchases_cleared', { monthKey: '2026-11', deleted: 21 }),
        entry(4, 'food.period_rule_set', { rule: 'working_day', paydayWorkingDay: 3 }),
        entry(5, 'calendar.day_set', { date: '2026-12-24', kind: 'off' }),
      ],
    ],
  })
  renderApp()
  const history = (await screen.findByText('Cumpărătură adăugată')).closest('ul') as HTMLElement
  expect(within(history).getAllByRole('listitem').map((item) => item.children[1]?.textContent)).toEqual([
    'Cumpărătură adăugatăLidl · 84,50lei · Noiembrie 2026',
    'Buget de mâncare setat2.100lei · surse: 2 · Noiembrie 2026',
    'Cumpărăturile lunii ștersecumpărături: 21 · Noiembrie 2026',
    'Perioada bugetului de mâncare schimbatăDe la salariu · a 3-a zi lucrătoare',
    'Zi din calendar modificată24 decembrie 2026 · Liber',
  ])
})

test('family changes show the family or the member they were about', async () => {
  const entry = (id: number, action: string, metadata: Record<string, string | number> | null) => ({
    id,
    action,
    metadata,
    createdAt: '2026-11-18T10:00:00.000Z',
  })
  fakeServer({
    '/api/user/me': [200, testAccount],
    '/api/family': [200, null],
    '/api/activity?limit=50': [
      200,
      [
        entry(1, 'family.created', { name: 'Familia Pop' }),
        entry(2, 'family.owner_transferred', { name: 'Ion Popescu' }),
        entry(3, 'family.invite_created', null),
        entry(4, 'food.shared', { moved: 3, skipped: 1 }),
        entry(5, 'food.share_resolved', { monthKey: '2026-11', resolution: 'keep_theirs' }),
        entry(6, 'family.dissolved', { name: 'Familia Pop' }),
      ],
    ],
  })
  renderApp()
  const history = (await screen.findByText('Familie creată')).closest('ul') as HTMLElement
  expect(within(history).getAllByRole('listitem').map((item) => item.children[1]?.textContent)).toEqual([
    'Familie creatăFamilia Pop',
    'Rol de administrator predatIon Popescu',
    'Cod de invitație generat',
    'Luni de mâncare partajate cu familialuni partajate: 3 · în conflict: 1',
    'Conflict de partajare rezolvatNoiembrie 2026 · ai păstrat luna familiei',
    'Ai părăsit familia, care s-a desfăcutFamilia Pop',
  ])
})

describe('the food period section', () => {
  const calendar2026 = {
    year: 2026,
    rule: 'working_day',
    paydayWorkingDay: 3,
    days: [
      { date: '2026-05-31', holiday: 'pentecost', legal: true, override: null, note: null, isWorkingDay: false },
      { date: '2026-06-01', holiday: 'children_day', legal: true, override: null, note: null, isWorkingDay: false },
      { date: '2026-06-01', holiday: 'pentecost', legal: true, override: null, note: null, isWorkingDay: false },
      { date: '2026-12-01', holiday: 'national_day', legal: true, override: 'working', note: null, isWorkingDay: true },
      { date: '2026-12-24', holiday: null, legal: false, override: 'off', note: 'Ajun', isWorkingDay: false },
    ],
    paydays: Array.from({ length: 12 }, (_, i) => ({
      monthKey: `2026-${String(i + 1).padStart(2, '0')}`,
      date: `2026-${String(i + 1).padStart(2, '0')}-05`,
    })),
  }

  test('switches to payday and picks the working day, saving each change', async () => {
    const payday = { ...testAccount, foodPeriodRule: 'working_day' as const }
    const fetchMock = fakeServer({ 'GET /api/user/me': [200, testAccount], 'PATCH /api/user/me': [200, payday] })
    renderApp()
    await userEvent.click(await screen.findByRole('radio', { name: 'De la salariu' }))
    expect(sentBody(fetchMock, '/api/user/me')).toEqual({ foodPeriodRule: 'working_day' })

    const select = await screen.findByLabelText('Salariul vine în')
    expect(within(select).getAllByRole('option').map((o) => o.textContent).slice(0, 3)).toEqual([
      'prima zi lucrătoare',
      'a 2-a zi lucrătoare',
      'a 3-a zi lucrătoare',
    ])
    await userEvent.selectOptions(select, '5')
    const bodies = fetchMock.mock.calls.filter(([, init]) => init?.method === 'PATCH').map(([, init]) => JSON.parse(init?.body as string) as unknown)
    expect(bodies.at(-1)).toEqual({ foodPaydayWorkingDay: 5 })
  })

  test('opens the working calendar, with the paydays and one switch per holiday date', async () => {
    // The dialog opens on this year.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-19T12:00:00'))
    const fetchMock = fakeServer({
      'GET /api/user/me': [200, { ...testAccount, foodPeriodRule: 'working_day' }],
      '/api/food/calendar/2026': [200, calendar2026],
      'PUT /api/food/calendar/2026-06-01': [200, { ok: true }],
      'DELETE /api/food/calendar/2026-12-24': [200, { ok: true }],
    })
    renderApp()
    await userEvent.click(await screen.findByRole('button', { name: 'Zile nelucrătoare și salarii' }))
    const dialog = screen.getByRole('dialog', { name: 'Zile nelucrătoare' })

    expect(await within(dialog).findByText('Salariul în 2026')).toBeDefined()
    const switches = within(dialog).getAllByRole('switch')
    expect(switches.map((s) => s.getAttribute('aria-label'))).toEqual([
      'Rusaliile, 31 mai 2026: zi liberă',
      'Ziua Copilului · Rusaliile, 1 iunie 2026: zi liberă',
      'Ziua Națională, 1 decembrie 2026: zi liberă',
    ])
    expect(switches[2]?.getAttribute('aria-checked')).toBe('false')
    expect(within(dialog).getByText('Ajun')).toBeDefined()

    await userEvent.click(switches[1] as HTMLElement)
    expect(sentBody(fetchMock, '/api/food/calendar/2026-06-01')).toEqual({ kind: 'working', note: null })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Șterge 24 decembrie 2026' }))
    expect(fetchMock.mock.calls.some(([path, init]) => path === '/api/food/calendar/2026-12-24' && init?.method === 'DELETE')).toBe(true)
  })
})
