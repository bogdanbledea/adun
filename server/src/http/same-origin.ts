import type { RequestHandler } from 'express'
import { forbidden, HttpError } from './errors.ts'

const SAFE_METHODS = new Set(['GET', 'HEAD'])

// Browsers send `Content-Length: 0` for a POST without a body; that is no body.
function hasBody(headers: Record<string, string | string[] | undefined>): boolean {
  if (headers['transfer-encoding'] !== undefined) return true
  return Number(headers['content-length'] ?? 0) > 0
}

/* Replaces a CSRF token. Mount it on /api. Every request other than GET or HEAD
   must come from the app's own pages:

   - Sec-Fetch-Site present: it must be "same-origin".
   - Sec-Fetch-Site absent (older browsers): Origin must equal APP_URL.
   - Both absent: rejected.

   A request with a body must also send it as application/json, which a plain
   HTML form cannot do. */
export function sameOriginGuard(appUrl: string): RequestHandler {
  return (req, _res, next) => {
    if (SAFE_METHODS.has(req.method)) {
      next()
      return
    }

    const site = req.get('Sec-Fetch-Site')
    const allowed = site === undefined ? req.get('Origin') === appUrl : site === 'same-origin'
    if (!allowed) {
      next(forbidden('cross_site_request', 'Cross-site requests are not allowed.'))
      return
    }

    if (hasBody(req.headers) && !req.is('application/json')) {
      next(new HttpError(415, 'unsupported_media_type', 'Send the request body as JSON.'))
      return
    }

    next()
  }
}
