import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLocation } from 'react-router'
import { afterEach, describe, expect, test, vi } from 'vitest'
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

test('signing in before confirming the address asks to check the email', async () => {
  fakeServer({
    '/api/user/me': signedOut,
    '/api/auth/login': [403, { error: { code: 'email_not_verified', message: 'Confirm.' } }],
  })
  renderApp('/buget')
  await fillIn('ana@example.com', 'Corect-cal-baterie-1')
  expect(await screen.findByRole('heading', { name: 'Verifică emailul' })).toBeDefined()
  expect(screen.getByText(/ana@example\.com/)).toBeDefined()
})

test('the confirmation link can be sent again, in the language in use', async () => {
  const fetchMock = fakeServer({
    '/api/user/me': signedOut,
    '/api/auth/login': [403, { error: { code: 'email_not_verified', message: 'Confirm.' } }],
    '/api/auth/resend-verification': [200, { ok: true }],
  })
  renderApp('/buget')
  await fillIn('ana@example.com', 'Corect-cal-baterie-1')
  await userEvent.click(await screen.findByRole('button', { name: 'Trimite din nou' }))
  expect(await screen.findByText(/am trimis un link nou/)).toBeDefined()
  expect(sentBody(fetchMock, '/api/auth/resend-verification')).toEqual({ email: 'ana@example.com', language: 'ro' })
})

test('the password can be shown while typing', async () => {
  fakeServer({ '/api/user/me': signedOut })
  renderApp('/buget')
  const password = await screen.findByLabelText('Parolă')
  expect(password.getAttribute('type')).toBe('password')
  await userEvent.click(screen.getByRole('button', { name: 'Arată parola' }))
  expect(password.getAttribute('type')).toBe('text')
})

describe('sign up', () => {
  async function openSignUp() {
    await userEvent.click(await screen.findByRole('button', { name: 'Înregistrează-te' }))
    expect(screen.getByRole('heading', { name: 'Cont nou' })).toBeDefined()
  }

  async function fill({ password = 'Corect-cal-baterie-1', confirm = '' } = {}) {
    await userEvent.type(screen.getByLabelText('Nume'), 'Ion Ionescu')
    await userEvent.type(screen.getByLabelText('Email'), 'ion@example.com')
    await userEvent.type(screen.getByLabelText('Parolă (min. 12 caractere)'), password)
    await userEvent.type(screen.getByLabelText('Confirmă parola'), confirm || password)
    await userEvent.click(screen.getByRole('button', { name: 'Creează cont' }))
  }

  test('checks the password and its confirmation before sending', async () => {
    const fetchMock = fakeServer({ '/api/user/me': signedOut, '/api/auth/status': [200, { registrationsEnabled: true }] })
    renderApp('/buget')
    await openSignUp()
    await fill({ password: 'scurta', confirm: 'alta' })

    expect(screen.getByText('Parola trebuie să aibă cel puțin 12 caractere.')).toBeDefined()
    expect(screen.getByText('Parolele nu se potrivesc.')).toBeDefined()
    expect(screen.getByLabelText('Confirmă parola').getAttribute('aria-invalid')).toBe('true')
    expect(sentBody(fetchMock, '/api/auth/register')).toBeUndefined()
  })

  test('a new account goes back to sign-in with the address filled in', async () => {
    const fetchMock = fakeServer({
      '/api/user/me': signedOut,
      '/api/auth/status': [200, { registrationsEnabled: true }],
      '/api/auth/register': [201, { ok: true }],
    })
    renderApp('/buget')
    await openSignUp()
    await fill()

    expect(await screen.findByRole('heading', { name: 'Autentificare' })).toBeDefined()
    expect(screen.getByText('Contul este gata. Intră cu emailul și parola alese.')).toBeDefined()
    expect(screen.getByLabelText('Email')).toHaveProperty('value', 'ion@example.com')
    expect(sentBody(fetchMock, '/api/auth/register')).toEqual({
      email: 'ion@example.com',
      password: 'Corect-cal-baterie-1',
      displayName: 'Ion Ionescu',
      language: 'ro',
    })
  })

  test('with email on, a new account is asked to check its email', async () => {
    fakeServer({
      '/api/user/me': signedOut,
      '/api/auth/status': [200, { registrationsEnabled: true, emailEnabled: true }],
      '/api/auth/register': [201, { ok: true }],
    })
    renderApp('/buget')
    await openSignUp()
    await fill()
    expect(await screen.findByRole('heading', { name: 'Verifică emailul' })).toBeDefined()
    expect(screen.getByText(/Am trimis un link de confirmare la ion@example\.com/)).toBeDefined()
  })

  test('a refusal from the server is shown in the form', async () => {
    fakeServer({
      '/api/user/me': signedOut,
      '/api/auth/status': [200, { registrationsEnabled: true }],
      '/api/auth/register': [400, { error: { code: 'weak_password', message: 'Weak.' } }],
    })
    renderApp('/buget')
    await openSignUp()
    await fill()
    expect((await screen.findByRole('alert')).textContent).toContain('Parola trebuie să aibă 12–200 de caractere')
  })

  test('links to the privacy page in a new tab', async () => {
    fakeServer({ '/api/user/me': signedOut, '/api/auth/status': [200, { registrationsEnabled: true }] })
    renderApp('/buget')
    await openSignUp()
    const link = screen.getByRole('link', { name: 'Vezi ce păstrează aplicația' })
    expect(link.getAttribute('href')).toBe('/confidentialitate')
    expect(link.getAttribute('target')).toBe('_blank')
  })

  test('when registrations are closed there is no way to sign up', async () => {
    fakeServer({ '/api/user/me': signedOut, '/api/auth/status': [200, { registrationsEnabled: false }] })
    renderApp('/buget')
    expect(await screen.findByText('Înregistrările sunt închise')).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Înregistrează-te' })).toBeNull()
  })
})

describe('forgotten password', () => {
  const emailOn: [number, unknown] = [200, { registrationsEnabled: true, emailEnabled: true }]

  async function askForLink(email: string) {
    await userEvent.click(await screen.findByRole('button', { name: 'Ai uitat parola?' }))
    expect(await screen.findByRole('heading', { name: 'Parolă uitată' })).toBeDefined()
    await userEvent.type(screen.getByLabelText('Email'), email)
    await userEvent.click(screen.getByRole('button', { name: 'Trimite linkul' }))
  }

  test('asks for a link in the language in use and says where it went', async () => {
    const fetchMock = fakeServer({
      '/api/user/me': signedOut,
      '/api/auth/status': emailOn,
      '/api/auth/forgot-password': [200, { ok: true }],
    })
    renderApp('/buget')
    await askForLink('ana@example.com')

    expect(await screen.findByRole('heading', { name: 'Verifică emailul' })).toBeDefined()
    expect(screen.getByText(/Dacă ana@example\.com are un cont, i-am trimis un link/)).toBeDefined()
    expect(sentBody(fetchMock, '/api/auth/forgot-password')).toEqual({ email: 'ana@example.com', language: 'ro' })
  })

  test('the link can be asked for again', async () => {
    fakeServer({
      '/api/user/me': signedOut,
      '/api/auth/status': emailOn,
      '/api/auth/forgot-password': [200, { ok: true }],
    })
    renderApp('/buget')
    await askForLink('ana@example.com')
    await userEvent.click(await screen.findByRole('button', { name: 'Trimite din nou' }))
    expect(await screen.findByText(/Dacă adresa are un cont, am trimis un link nou/)).toBeDefined()
  })

  test('keeps the address typed at sign-in, and leads back to it', async () => {
    fakeServer({ '/api/user/me': signedOut, '/api/auth/status': emailOn })
    renderApp('/buget')
    await userEvent.type(await screen.findByLabelText('Email'), 'ana@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Ai uitat parola?' }))
    expect(screen.getByLabelText<HTMLInputElement>('Email').value).toBe('ana@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Înapoi la autentificare' }))
    expect(await screen.findByRole('heading', { name: 'Autentificare' })).toBeDefined()
  })

  test('/parola-uitata opens straight on the form, and signing in from there opens the budget', async () => {
    const fetchMock = fakeServer({
      '/api/user/me': signedOut,
      '/api/auth/status': emailOn,
      '/api/auth/forgot-password': [200, { ok: true }],
      '/api/auth/login': [200, testAccount],
    })
    renderApp('/parola-uitata')
    expect(await screen.findByRole('heading', { name: 'Parolă uitată' })).toBeDefined()
    await userEvent.type(screen.getByLabelText('Email'), 'ana@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Trimite linkul' }))
    expect(await screen.findByRole('heading', { name: 'Verifică emailul' })).toBeDefined()
    expect(sentBody(fetchMock, '/api/auth/forgot-password')).toEqual({ email: 'ana@example.com', language: 'ro' })

    await userEvent.click(screen.getByRole('button', { name: 'Înapoi la autentificare' }))
    await userEvent.type(await screen.findByLabelText('Parolă'), 'Corect-cal-baterie-1')
    await userEvent.click(screen.getByRole('button', { name: 'Intră în cont' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Buget' })).toBeDefined()
    expect(screen.getByTestId('location').textContent).toBe('/buget')
  })

  test('/parola-uitata, already signed in, opens the budget', async () => {
    fakeServer({ '/api/user/me': [200, testAccount] })
    renderApp('/parola-uitata')
    expect(await screen.findByRole('heading', { level: 1, name: 'Buget' })).toBeDefined()
    expect(screen.getByTestId('location').textContent).toBe('/buget')
  })

  test('with email off, explains that no link can be sent', async () => {
    fakeServer({
      '/api/user/me': signedOut,
      '/api/auth/status': [200, { registrationsEnabled: true, emailEnabled: false }],
    })
    renderApp('/buget')
    await screen.findByRole('button', { name: 'Înregistrează-te' })
    await userEvent.click(screen.getByRole('button', { name: 'Ai uitat parola?' }))
    expect(await screen.findByText('Parola nu poate fi schimbată prin email')).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Trimite linkul' })).toBeNull()
  })
})
