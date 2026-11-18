import { vi } from 'vitest'

/* A stand-in for the server: each path answers with a status and a JSON
   body, and anything else is a 404. Returns the fetch mock, so a test can see
   what was sent. */

type Answer = [status: number, body: unknown] | (() => Promise<Response>)

export function fakeServer(routes: Record<string, Answer>) {
  const fetchMock = vi.fn((path: string) => {
    const answer = routes[path] ?? [404, { error: { code: 'not_found', message: 'Not found.' } }]
    if (typeof answer === 'function') return answer()
    return Promise.resolve(new Response(JSON.stringify(answer[1]), { status: answer[0] }))
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

export const signedOut: Answer = [401, { error: { code: 'unauthorized', message: 'Sign in to continue.' } }]

/** The JSON body of the first request sent to `path`. */
export function sentBody(fetchMock: ReturnType<typeof fakeServer>, path: string): unknown {
  const call = fetchMock.mock.calls.find((args) => args[0] === path) as unknown as [string, RequestInit] | undefined
  return call ? JSON.parse(call[1].body as string) : undefined
}
