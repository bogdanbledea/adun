import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLocation } from 'react-router'
import { afterEach, expect, test, vi } from 'vitest'
import { App } from '../../App.tsx'
import { testAccount } from '../../test/account.ts'
import { renderWithProviders } from '../../test/render.tsx'
import { fakeServer, sentBody, signedOut } from '../../test/server.ts'

const TOKEN = 'A'.repeat(43)
const NEW_PASSWORD = 'Alta-parola-buna-2'

function Location() {
  return <output data-testid="location">{useLocation().pathname}</output>
}

function renderLink(hash = `#token=${TOKEN}`) {
  return renderWithProviders(
    <>
      <App />
      <Location />
    </>,
    { path: `/parola-noua${hash}`, withAuth: true },
  )
}

async function choose(password: string, confirm = password) {
  await userEvent.type(await screen.findByLabelText('Parolă (min. 12 caractere)'), password)
  await userEvent.type(screen.getByLabelText('Confirmă parola'), confirm)
  await userEvent.click(screen.getByRole('button', { name: 'Salvează și intră în cont' }))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

test('the new password signs in and opens the budget', async () => {
  const fetchMock = fakeServer({ '/api/user/me': signedOut, '/api/auth/reset-password': [200, { user: testAccount }] })
  renderLink()
  expect(await screen.findByRole('heading', { name: 'Parolă nouă' })).toBeDefined()
  // The token has left the address bar.
  expect(screen.getByTestId('location').textContent).toBe('/parola-noua')

  await choose(NEW_PASSWORD)
  expect(await screen.findByRole('heading', { level: 1, name: 'Buget' })).toBeDefined()
  expect(screen.getByTestId('location').textContent).toMatch(/^\/buget\/\d{2}-\d{2}$/)
  expect(sentBody(fetchMock, '/api/auth/reset-password')).toEqual({ token: TOKEN, password: NEW_PASSWORD })
})

test('checks the password and its confirmation before sending', async () => {
  const fetchMock = fakeServer({ '/api/user/me': signedOut })
  renderLink()
  await choose('scurta')
  expect(await screen.findByText('Parola trebuie să aibă cel puțin 12 caractere.')).toBeDefined()
  await userEvent.clear(screen.getByLabelText('Parolă (min. 12 caractere)'))
  await userEvent.clear(screen.getByLabelText('Confirmă parola'))
  await choose(NEW_PASSWORD, 'Alta-parola-buna-3')
  expect(await screen.findByText('Parolele nu se potrivesc.')).toBeDefined()
  expect(sentBody(fetchMock, '/api/auth/reset-password')).toBeUndefined()
})

test('a used or expired link says so in place of the form', async () => {
  fakeServer({
    '/api/user/me': signedOut,
    '/api/auth/reset-password': [400, { error: { code: 'invalid_token', message: 'Invalid.' } }],
  })
  renderLink()
  await choose(NEW_PASSWORD)
  expect(await screen.findByRole('heading', { name: 'Parola nu a fost schimbată' })).toBeDefined()
  expect(screen.getByRole('alert').textContent).toMatch(/Linkul nu mai este valabil/)
  expect(screen.queryByRole('button', { name: 'Salvează și intră în cont' })).toBeNull()
  expect(screen.getByRole('link', { name: 'Înapoi la autentificare' })).toBeDefined()
})

test('a link without its token shows no form', async () => {
  fakeServer({ '/api/user/me': signedOut })
  renderLink('')
  expect(await screen.findByText(/Linkul este incomplet/)).toBeDefined()
  expect(screen.queryByLabelText('Parolă (min. 12 caractere)')).toBeNull()
})
