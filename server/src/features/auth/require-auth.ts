import type { RequestHandler, Response } from 'express'
import type { Config } from '../../config.ts'
import type { Database } from '../../db.ts'
import { unauthorized } from '../../http/errors.ts'
import { authenticate } from './service.ts'
import { clearSessionCookie, readSessionToken, setSessionCookie } from './session.ts'

/* Lets a request through only with a live session, and records who it is for
   in res.locals. Every answer to a missing, expired or revoked session is the
   same 401 `unauthorized`, which the web app treats as "signed out". */
export function requireAuth(db: Database, config: Config): RequestHandler {
  return (req, res, next) => {
    const token = readSessionToken(req, config)
    const session = token ? authenticate(db, token) : null
    if (!session) {
      // Stops the browser sending a dead cookie again.
      if (token) clearSessionCookie(res, config)
      next(unauthorized())
      return
    }
    if (session.renewed && token) setSessionCookie(res, config, token)
    res.locals.userId = session.userId
    res.locals.sessionId = session.sessionId
    next()
  }
}

/** Who the request is for; only valid behind requireAuth. */
export function currentSession(res: Response): { userId: string; sessionId: string } {
  return { userId: res.locals.userId as string, sessionId: res.locals.sessionId as string }
}
