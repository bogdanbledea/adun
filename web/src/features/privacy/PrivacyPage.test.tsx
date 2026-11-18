import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { App } from '../../App.tsx'
import { testAccount } from '../../test/account.ts'
import { renderWithProviders } from '../../test/render.tsx'
import { fakeServer, signedOut } from '../../test/server.ts'

afterEach(() => {
  vi.unstubAllGlobals()
})

const renderApp = (path: string) => renderWithProviders(<App />, { path, withAuth: true })

test('can be read without signing in', async () => {
  fakeServer({ '/api/user/me': signedOut })
  renderApp('/confidentialitate')
  expect(await screen.findByRole('heading', { level: 1, name: 'Confidențialitate' })).toBeDefined()
  expect(screen.getByRole('heading', { name: 'Ce se păstrează' })).toBeDefined()
  expect(screen.getByText(/Istoricul activității/)).toBeDefined()
  expect(screen.getByText(/Bugetul: lunile și șablonul, cu categoriile și înregistrările lor/)).toBeDefined()
  expect(screen.getByRole('heading', { name: 'Ce poți face' })).toBeDefined()
  expect(screen.queryByRole('navigation', { name: 'Secțiuni' })).toBeNull()
})

test('signed in, it opens inside the app, from the footer', async () => {
  fakeServer({ '/api/user/me': [200, testAccount] })
  renderApp('/buget')
  await userEvent.click(await screen.findByRole('link', { name: 'Confidențialitate' }))
  expect(screen.getByRole('heading', { level: 1, name: 'Confidențialitate' })).toBeDefined()
  expect(screen.getByRole('navigation', { name: 'Secțiuni' })).toBeDefined()
})
