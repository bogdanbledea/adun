import { createHash, randomBytes } from 'node:crypto'
import type { CookieOptions, Request, Response } from 'express'
import type { Config } from '../../config.ts'

/* The session cookie. Its value is 32 random bytes, the same kind of token
   email links carry; the database keeps only the SHA-256, so a copy of the
   database yields no usable session.

   Over https (always in production) the cookie is `__Host-adun_session` with
   Secure: the prefix pins it to this exact origin and forbids a Domain
   attribute. Plain-http development cannot set Secure cookies in every
   browser, so there it is `adun_session` without Secure. */

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

export function newToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

const secure = (config: Config) => config.appUrl.startsWith('https://')

export function sessionCookieName(config: Config): string {
  return secure(config) ? '__Host-adun_session' : 'adun_session'
}

function cookieOptions(config: Config): CookieOptions {
  // Lax still keeps the cookie off cross-site POSTs, and unlike Strict it is
  // sent when arriving from a link in an email.
  return { httpOnly: true, secure: secure(config), sameSite: 'lax', path: '/' }
}

export function setSessionCookie(res: Response, config: Config, token: string): void {
  res.cookie(sessionCookieName(config), token, { ...cookieOptions(config), maxAge: SESSION_TTL_MS })
}

export function clearSessionCookie(res: Response, config: Config): void {
  res.clearCookie(sessionCookieName(config), cookieOptions(config))
}

const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/

/** True for a value shaped like a token from newToken(). */
export function looksLikeToken(value: string): boolean {
  return TOKEN_SHAPE.test(value)
}

/** The session token from the Cookie header, or null. Anything that is not
    shaped like a token we issued is ignored. */
export function readSessionToken(req: Request, config: Config): string | null {
  const name = sessionCookieName(config)
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const separator = part.indexOf('=')
    if (separator === -1 || part.slice(0, separator).trim() !== name) continue
    const value = part.slice(separator + 1).trim()
    return looksLikeToken(value) ? value : null
  }
  return null
}
