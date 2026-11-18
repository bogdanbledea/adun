import { afterEach, describe, expect, test, vi } from 'vitest'
import { api, ApiError, errorText, setUnauthorizedHandler } from './api.ts'
import { translate, type MessageKey } from './i18n.tsx'

function respond(status: number, body?: unknown) {
  const fetchMock = vi.fn(() =>
    Promise.resolve(new Response(body === undefined ? null : JSON.stringify(body), { status })),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const errorBody = (code: string, message = 'x') => ({ error: { code, message } })

afterEach(() => {
  vi.unstubAllGlobals()
})

const failure = async (promise: Promise<unknown>) => {
  try {
    await promise
  } catch (err) {
    return err as ApiError
  }
  throw new Error('expected the request to fail')
}

describe('api', () => {
  test('sends JSON on the same origin, uncached, and returns the parsed body', async () => {
    const fetchMock = respond(200, { id: 'a' })
    await expect(api('/api/auth/login', { method: 'POST', body: { email: 'ana@example.com' } })).resolves.toEqual({
      id: 'a',
    })

    const [path, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(path).toBe('/api/auth/login')
    expect(init.method).toBe('POST')
    expect(init.body).toBe('{"email":"ana@example.com"}')
    expect(init.credentials).toBe('same-origin')
    expect(init.cache).toBe('no-store')
    expect(init.headers).toMatchObject({ 'Content-Type': 'application/json', Accept: 'application/json' })
  })

  test('a request without a body sends no Content-Type', async () => {
    const fetchMock = respond(204)
    await expect(api('/api/auth/logout', { method: 'POST' })).resolves.toBeUndefined()
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1]
    expect(init.body).toBeUndefined()
    expect(init.headers).not.toHaveProperty('Content-Type')
  })

  test('turns the error body into an ApiError with the stable code', async () => {
    respond(403, errorBody('registrations_disabled', 'New accounts are not accepted.'))
    const err = await failure(api('/api/auth/register'))
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(403)
    expect(err.code).toBe('registrations_disabled')
    expect(err.message).toBe('New accounts are not accepted.')
  })

  test('a body that is not the error shape still fails with a code', async () => {
    respond(502)
    expect((await failure(api('/api/user/me'))).code).toBe('unknown')
  })

  test('no answer at all is a network_error', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))))
    const err = await failure(api('/api/user/me'))
    expect(err.status).toBe(0)
    expect(err.code).toBe('network_error')
  })

  test('a lost session runs the unauthorized handler; other 401s do not', async () => {
    const handler = vi.fn()
    const remove = setUnauthorizedHandler(handler)

    respond(401, errorBody('invalid_credentials'))
    await failure(api('/api/auth/login', { method: 'POST', body: {} }))
    expect(handler).not.toHaveBeenCalled()

    respond(401, errorBody('unauthorized'))
    expect((await failure(api('/api/user/me'))).code).toBe('unauthorized')
    expect(handler).toHaveBeenCalledOnce()

    remove()
    await failure(api('/api/user/me'))
    expect(handler).toHaveBeenCalledOnce()
  })
})

describe('errorText', () => {
  const t = (language: 'ro' | 'en') => (key: MessageKey) => translate(language, key)

  test('translates known codes in the current language', () => {
    const err = new ApiError(429, 'rate_limited', 'Too many requests.')
    expect(errorText(err, t('en'))).toBe('Too many requests. Try again later.')
    expect(errorText(err, t('ro'))).toBe('Prea multe cereri. Încearcă din nou mai târziu.')
  })

  test('unknown codes and other errors get the general message; a 500 keeps its request ID', () => {
    expect(errorText(new ApiError(400, 'something_new', 'x'), t('en'))).toBe('Something went wrong. Try again.')
    expect(errorText(new Error('boom'), t('en'))).toBe('Something went wrong. Try again.')
    expect(errorText(new ApiError(500, 'internal_error', 'x', 'req-1'), t('en'))).toBe(
      'An unexpected error occurred. (req-1)',
    )
  })
})
