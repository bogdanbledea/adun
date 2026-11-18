import type { ErrorRequestHandler, RequestHandler } from 'express'

/* Every error response has one shape: { error: { code, message } }. `code` is
   stable and the web app translates by it; `message` is an English fallback
   for anyone reading the API directly. A 500 also carries the request ID so a
   user can quote it. */

export class HttpError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.code = code
  }
}

export const badRequest = (code: string, message: string) => new HttpError(400, code, message)
export const unauthorized = (code = 'unauthorized', message = 'Sign in to continue.') =>
  new HttpError(401, code, message)
export const forbidden = (code = 'forbidden', message = 'Not allowed.') => new HttpError(403, code, message)
export const notFound = (code = 'not_found', message = 'Not found.') => new HttpError(404, code, message)
export const conflict = (code: string, message: string) => new HttpError(409, code, message)

// For any request that reached no route.
export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(notFound())
}

// Errors raised by express.json() carry a `type`; these are the client's fault.
const BODY_PARSER_ERRORS: Record<string, HttpError> = {
  'entity.too.large': new HttpError(413, 'payload_too_large', 'The request is too large.'),
  'entity.parse.failed': new HttpError(400, 'invalid_json', 'The request is not valid JSON.'),
  'encoding.unsupported': new HttpError(415, 'unsupported_encoding', 'Unsupported encoding.'),
  'charset.unsupported': new HttpError(415, 'unsupported_encoding', 'Unsupported encoding.'),
}

function toHttpError(err: unknown): HttpError | null {
  if (err instanceof HttpError) return err
  if (typeof err === 'object' && err !== null && 'type' in err && typeof err.type === 'string') {
    return BODY_PARSER_ERRORS[err.type] ?? null
  }
  return null
}

export const errorHandler: ErrorRequestHandler = (err: unknown, req, res, next) => {
  if (res.headersSent) {
    next(err)
    return
  }
  const known = toHttpError(err)
  if (known) {
    res.status(known.status).json({ error: { code: known.code, message: known.message } })
    return
  }
  // Always a UUID string: app.ts generates it.
  const requestId = req.id as string
  req.log.error({ err }, 'http.unhandled_error')
  res.status(500).json({
    error: { code: 'internal_error', message: `Something went wrong. Reference: ${requestId}`, requestId },
  })
}
