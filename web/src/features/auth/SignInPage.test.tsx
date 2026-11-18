import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLocation } from 'react-router'
import { afterEach, expect, test, vi } from 'vitest'
import { App } from '../../App.tsx'
import { testAccount } from '../../test/account.ts'
import { renderWithProviders } from '../../test/render.tsx'
import { fakeServer, sentBody, signedOut } from '../../test/server.ts'

function Location() {
  return <output data-testid="location">{useLocation().pathname}</output>
}

function renderApp(path: string) {
  return renderWithProviders(
    <>
      <App />
      <Location />
    </>,
    { path, withAuth: true },
  )
}

async function fillIn(email: string, password: string) {
  await userEvent.type(await screen.findByLabelText('Email'), email)
  await userEvent.type(screen.getByLabelText('Parolă'), password)
  await userEvent.click(screen.getByRole('button', { name: 'Intră în cont' }))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

test('without a session, any page shows the sign-in form at the same address', async () => {
  fakeServer({ '/api/user/me': signedOut })
  renderApp('/scadente')
  expect(await screen.findByRole('heading', { name: 'Autentificare' })).toBeDefined()
  expect(screen.queryByRole('navigation', { name: 'Secțiuni' })).toBeNull()
  expect(screen.getByTestId('location').textContent).toBe('/scadente')
})

test('signing in shows the page that was asked for', async () => {
  const fetchMock = fakeServer({ '/api/user/me': signedOut, '/api/auth/login': [200, testAccount] })
  renderApp('/scadente')
  await fillIn('ana@example.com', 'Corect-cal-baterie-1')

  expect(await screen.findByRole('heading', { level: 1, name: 'Scadențe' })).toBeDefined()
  expect(screen.getByRole('navigation', { name: 'Secțiuni' })).toBeDefined()
  expect(screen.getByTestId('location').textContent).toBe('/scadente')
  expect(sentBody(fetchMock, '/api/auth/login')).toEqual({
    email: 'ana@example.com',
    password: 'Corect-cal-baterie-1',
  })
})

test('a wrong password is explained and the form stays', async () => {
  fakeServer({
    '/api/user/me': signedOut,
    '/api/auth/login': [401, { error: { code: 'invalid_credentials', message: 'Wrong email or password.' } }],
  })
  renderApp('/buget')
  await fillIn('ana@example.com', 'Gresit-cal-baterie-1')

  expect((await screen.findByRole('alert')).textContent).toBe('Email sau parolă incorecte.')
  expect(screen.getByRole('button', { name: 'Intră în cont' })).toBeDefined()
})

test('the password can be shown while typing', async () => {
  fakeServer({ '/api/user/me': signedOut })
  renderApp('/buget')
  const password = await screen.findByLabelText('Parolă')
  expect(password.getAttribute('type')).toBe('password')
  await userEvent.click(screen.getByRole('button', { name: 'Arată parola' }))
  expect(password.getAttribute('type')).toBe('text')
})
