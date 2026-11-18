import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLocation } from 'react-router'
import { afterEach, expect, test, vi } from 'vitest'
import { App } from '../../App.tsx'
import { testAccount } from '../../test/account.ts'
import { renderWithProviders } from '../../test/render.tsx'
import { fakeServer, signedOut } from '../../test/server.ts'

const TOKEN = 'A'.repeat(43)

function Location() {
  const location = useLocation()
  return <output data-testid="location">{location.pathname + location.hash}</output>
}

function renderLink(hash = `#token=${TOKEN}`) {
  return renderWithProviders(
    <>
      <App />
      <Location />
    </>,
    { path: `/verifica-email${hash}`, withAuth: true },
  )
}

const bodiesSentTo = (fetchMock: ReturnType<typeof fakeServer>, path: string) =>
  fetchMock.mock.calls
    .filter((args) => args[0] === path)
    .map((args) => JSON.parse((args as unknown as [string, RequestInit])[1].body as string) as unknown)

afterEach(() => {
  vi.unstubAllGlobals()
})

test('in the browser that registered, the link signs in and opens the budget', async () => {
  const fetchMock = fakeServer({ '/api/user/me': signedOut, '/api/auth/verify-email': [200, { user: testAccount }] })
  renderLink()
  expect(await screen.findByRole('heading', { level: 1, name: 'Buget' })).toBeDefined()
  expect(screen.getByTestId('location').textContent).toBe('/buget')
  expect(bodiesSentTo(fetchMock, '/api/auth/verify-email')).toEqual([{ token: TOKEN }])
})

test('elsewhere, it asks for the password, then signs in', async () => {
  let answer: unknown = { user: null, passwordRequired: true }
  const fetchMock = fakeServer({
    '/api/user/me': signedOut,
    '/api/auth/verify-email': () => Promise.resolve(Response.json(answer)),
  })
  renderLink()
  expect(await screen.findByRole('heading', { name: 'Confirmă cu parola' })).toBeDefined()
  // The token has left the address bar.
  expect(screen.getByTestId('location').textContent).toBe('/verifica-email')

  answer = { user: testAccount }
  await userEvent.type(screen.getByLabelText('Parolă'), 'Corect-cal-baterie-1')
  await userEvent.click(screen.getByRole('button', { name: 'Confirmă și intră în cont' }))
  expect(await screen.findByRole('heading', { level: 1, name: 'Buget' })).toBeDefined()
  expect(bodiesSentTo(fetchMock, '/api/auth/verify-email')).toEqual([
    { token: TOKEN },
    { token: TOKEN, password: 'Corect-cal-baterie-1' },
  ])
})

test('a wrong password is explained and the form stays', async () => {
  let answer: [number, unknown] = [200, { user: null, passwordRequired: true }]
  fakeServer({
    '/api/user/me': signedOut,
    '/api/auth/verify-email': () => Promise.resolve(Response.json(answer[1], { status: answer[0] })),
  })
  renderLink()
  await screen.findByRole('heading', { name: 'Confirmă cu parola' })

  answer = [401, { error: { code: 'wrong_password', message: 'Wrong.' } }]
  await userEvent.type(screen.getByLabelText('Parolă'), 'Gresit-cal-baterie-1')
  await userEvent.click(screen.getByRole('button', { name: 'Confirmă și intră în cont' }))
  expect((await screen.findByRole('alert')).textContent).toBe('Parola nu este corectă.')
})

test('a used or expired link says so', async () => {
  fakeServer({
    '/api/user/me': signedOut,
    '/api/auth/verify-email': [400, { error: { code: 'invalid_token', message: 'Invalid.' } }],
  })
  renderLink()
  expect(await screen.findByRole('heading', { name: 'Confirmarea nu a reușit' })).toBeDefined()
  expect(screen.getByRole('alert').textContent).toMatch(/Linkul nu mai este valabil/)
  expect(screen.getByRole('link', { name: 'Înapoi la autentificare' })).toBeDefined()
})

test('a link without its token sends nothing', async () => {
  const fetchMock = fakeServer({ '/api/user/me': signedOut })
  renderLink('')
  expect(await screen.findByText(/Linkul este incomplet/)).toBeDefined()
  expect(bodiesSentTo(fetchMock, '/api/auth/verify-email')).toEqual([])
})
