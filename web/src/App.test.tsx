import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { App } from './App.tsx'
import { testAccount } from './test/account.ts'
import { renderWithProviders } from './test/render.tsx'
import { fakeServer, sentBody } from './test/server.ts'

beforeEach(() => {
  fakeServer({ '/api/user/me': [200, testAccount] })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const renderApp = (path: string) => renderWithProviders(<App />, { path, withAuth: true })

test('the root opens the budget, with its tab marked as current', async () => {
  renderApp('/')
  expect(await screen.findByRole('heading', { level: 1, name: 'Buget' })).toBeDefined()
  expect(screen.getByRole('link', { name: 'Buget' }).getAttribute('aria-current')).toBe('page')
})

test('the tabs move between sections', async () => {
  renderApp('/buget')
  await userEvent.click(await screen.findByRole('link', { name: 'Mâncare' }))
  expect(await screen.findByRole('heading', { level: 1, name: 'Mâncare' })).toBeDefined()
  await userEvent.click(screen.getByRole('link', { name: 'Scadențe' }))
  expect(screen.getByRole('heading', { level: 1, name: 'Scadențe' })).toBeDefined()
})

test('the shell switches language and theme', async () => {
  renderApp('/buget')

  await userEvent.click(await screen.findByRole('button', { name: 'Switch to English' }))
  expect(screen.getByRole('heading', { level: 1, name: 'Budget' })).toBeDefined()

  await userEvent.click(screen.getByRole('button', { name: 'Switch to dark theme' }))
  expect(document.documentElement.classList.contains('dark')).toBe(true)
  expect(screen.getByRole('button', { name: 'Switch to light theme' })).toBeDefined()
})

test('signed in, the language chosen is kept on the account', async () => {
  const fetchMock = fakeServer({ '/api/user/me': [200, testAccount] })
  renderApp('/buget')

  await userEvent.click(await screen.findByRole('button', { name: 'Switch to English' }))
  expect(sentBody(fetchMock, '/api/user/me')).toEqual({ language: 'en' })
})

test('the eye button hides amounts and shows them again', async () => {
  renderApp('/buget')

  const hide = await screen.findByRole('button', { name: 'Ascunde sumele' })
  expect(hide.getAttribute('aria-pressed')).toBe('false')
  await userEvent.click(hide)
  const show = screen.getByRole('button', { name: 'Arată sumele' })
  expect(show.getAttribute('aria-pressed')).toBe('true')
  expect(localStorage.getItem('amountsHidden')).toBe('true')

  await userEvent.click(show)
  expect(screen.getByRole('button', { name: 'Ascunde sumele' })).toBeDefined()
})

test('an unknown address shows a page not found with a way back', async () => {
  renderApp('/nicaieri')
  expect(await screen.findByRole('heading', { name: 'Pagina nu există' })).toBeDefined()
  await userEvent.click(screen.getByRole('link', { name: 'Înapoi la buget' }))
  expect(screen.getByRole('heading', { level: 1, name: 'Buget' })).toBeDefined()
})

describe('account menu', () => {
  test('shows the initials and signs out of this session', async () => {
    const fetchMock = fakeServer({ '/api/user/me': [200, testAccount], '/api/auth/logout': [200, { ok: true }] })
    renderApp('/mancare')
    const menu = await screen.findByRole('button', { name: 'Meniu cont' })
    expect(menu.textContent).toBe('AP')

    await userEvent.click(menu)
    await userEvent.click(screen.getByRole('menuitem', { name: 'Deconectare' }))
    expect(await screen.findByRole('heading', { name: 'Autentificare' })).toBeDefined()
    expect(fetchMock.mock.calls.some(([path]) => path === '/api/auth/logout')).toBe(true)
  })

  test('signs out on every device', async () => {
    const fetchMock = fakeServer({ '/api/user/me': [200, testAccount], '/api/auth/logout-all': [200, { ok: true }] })
    renderApp('/buget')
    await userEvent.click(await screen.findByRole('button', { name: 'Meniu cont' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Ieși de pe toate dispozitivele' }))
    expect(await screen.findByRole('heading', { name: 'Autentificare' })).toBeDefined()
    expect(fetchMock.mock.calls.some(([path]) => path === '/api/auth/logout-all')).toBe(true)
  })

  test('if signing out everywhere fails, this browser stays signed in', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    fakeServer({ '/api/user/me': [200, testAccount], '/api/auth/logout-all': () => Promise.reject(new TypeError('offline')) })
    renderApp('/buget')
    await userEvent.click(await screen.findByRole('button', { name: 'Meniu cont' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Ieși de pe toate dispozitivele' }))
    await vi.waitFor(() => { expect(console.error).toHaveBeenCalled() })
    expect(screen.getByRole('heading', { level: 1, name: 'Buget' })).toBeDefined()
  })

  test('opens the privacy page', async () => {
    renderApp('/buget')
    await userEvent.click(await screen.findByRole('button', { name: 'Meniu cont' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Confidențialitate' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Confidențialitate' })).toBeDefined()
  })
})
