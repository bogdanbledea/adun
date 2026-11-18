import { isMessageKey, type Translate } from './i18n.tsx'

/* The one way the web app talks to the server. Same origin, JSON in and out;
   the session cookie travels on its own (HttpOnly, nothing here sees it).

   Every failure becomes an ApiError carrying the server's stable `code`
   ({ error: { code, message } }, see server/src/http/errors.ts), or
   `network_error` when no answer arrived. A 401 `unauthorized` means there is
   no valid session: the registered handler runs, so the auth provider can
   forget the user. Other 401s, such as a wrong password, are ordinary errors
   for the form to show. */

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly requestId: string | undefined

  constructor(status: number, code: string, message: string, requestId?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.requestId = requestId
  }
}

let onUnauthorized: (() => void) | null = null

/** Set by the auth provider; returns a function that removes it. */
export function setUnauthorizedHandler(handler: () => void): () => void {
  onUnauthorized = handler
  return () => {
    if (onUnauthorized === handler) onUnauthorized = null
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export interface RequestOptions {
  method?: Method
  body?: unknown
  signal?: AbortSignal
}

export async function api<T>(path: string, { method = 'GET', body, signal }: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  let response: Response
  try {
    response = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
      cache: 'no-store',
      signal,
    })
  } catch (err) {
    if (signal?.aborted) throw err
    throw new ApiError(0, 'network_error', 'The server is not answering.')
  }

  const data: unknown = await response.json().catch(() => undefined)
  if (response.ok) return data as T

  const error = readErrorBody(data)
  const failure = new ApiError(
    response.status,
    error.code ?? 'unknown',
    error.message ?? `HTTP ${String(response.status)}`,
    error.requestId,
  )
  if (failure.status === 401 && failure.code === 'unauthorized') onUnauthorized?.()
  throw failure
}

function readErrorBody(data: unknown): { code?: string; message?: string; requestId?: string } {
  if (typeof data !== 'object' || data === null || !('error' in data)) return {}
  const error = data.error
  if (typeof error !== 'object' || error === null) return {}
  const field = (name: string) => {
    const value = (error as Record<string, unknown>)[name]
    return typeof value === 'string' ? value : undefined
  }
  return { code: field('code'), message: field('message'), requestId: field('requestId') }
}

/** The text to show for a failed request, in the current language. */
export function errorText(err: unknown, t: Translate): string {
  if (!(err instanceof ApiError)) return t('error.unknown')
  const key = `error.${err.code}`
  const text = isMessageKey(key) ? t(key) : t('error.unknown')
  return err.requestId ? `${text} (${err.requestId})` : text
}
