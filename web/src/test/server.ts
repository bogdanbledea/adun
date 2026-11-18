import { vi } from 'vitest'

/* A stand-in for the server: each path answers with a status and a JSON
   body, and anything else is a 404. A key may start with the method
   ('PATCH /api/user/me') to answer that method only; it wins over the bare
   path. Returns the fetch mock, so a test can see what was sent. */

type Answer = [status: number, body: unknown] | (() => Promise<Response>)

export function fakeServer(routes: Record<string, Answer>) {
  const fetchMock = vi.fn((path: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const answer = routes[`${method} ${path}`] ?? routes[path] ?? [404, { error: { code: 'not_found', message: 'Not found.' } }]
    if (typeof answer === 'function') return answer()
    return Promise.resolve(new Response(JSON.stringify(answer[1]), { status: answer[0] }))
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

export const signedOut: Answer = [401, { error: { code: 'unauthorized', message: 'Sign in to continue.' } }]

/** The JSON body of the first request sent to `path`, with a body. */
export function sentBody(fetchMock: ReturnType<typeof fakeServer>, path: string): unknown {
  const call = fetchMock.mock.calls.find((args) => args[0] === path && args[1]?.body !== undefined)
  return call ? JSON.parse(call[1]?.body as string) : undefined
}
