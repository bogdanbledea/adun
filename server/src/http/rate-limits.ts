import type { RequestHandler } from 'express'
import { rateLimit } from 'express-rate-limit'
import { HttpError } from './errors.ts'

/* Per-IP limits kept in memory, which is correct because the app runs as one
   process. Client IPs come from req.ip, so TRUST_PROXY_HOPS must match the
   proxies in front. */

const MINUTE = 60 * 1000

export function limiter(windowMs: number, limit: number): RequestHandler {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) => {
      next(new HttpError(429, 'rate_limited', 'Too many requests. Try again later.'))
    },
  })
}

// Everything the server answers, from one address.
export const generalLimit = (): RequestHandler => limiter(5 * MINUTE, 300)

// /api/auth/*: sign in, register, password reset.
export const authLimit = (): RequestHandler => limiter(15 * MINUTE, 40)
