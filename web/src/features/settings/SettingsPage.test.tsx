import { screen } from '@testing-library/react'
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
