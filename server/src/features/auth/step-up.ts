import type { Response } from 'express'
import type { Database } from '../../db.ts'
import { forbidden, unauthorized } from '../../http/errors.ts'
import type { Logger } from '../../lib/log.ts'
import * as repo from './repository.ts'
import { currentSession } from './require-auth.ts'
import { passwordMatches, wrongPassword } from './service.ts'

/* Actions that cannot be undone ask for the password again first, so a
   session left open on a shared computer is not enough to do them. The web
   app sends the password to /confirm-password, which marks the session; the
   action then has five minutes to use that mark, and uses it up, so each
   typed password allows one such action. Signing in does not count: the
   password is always asked for right before the action. */

export const PASSWORD_CONFIRMATION_MS = 5 * 60 * 1000

/** Checks the password, counted towards the lockout as a sign-in is, and
    marks the session. */
export async function confirmPassword(
  db: Database,
  log: Logger,
  { userId, sessionId }: { userId: string; sessionId: string },
  password: string,
): Promise<void> {
  if (!(await passwordMatches(db, log, userId, password, 'auth.confirm_password_failed'))) throw wrongPassword()
  // The session may have ended while the hash was being checked.
  if (!repo.setPasswordConfirmed(db, sessionId, new Date().toISOString())) throw unauthorized()
  log.info({ userId }, 'auth.password_confirmed')
}

/** Whether the password was confirmed on this session in the last five
    minutes; if so, that confirmation is used up. */
export function claimRecentPassword(db: Database, sessionId: string, now = Date.now()): boolean {
  const since = new Date(now - PASSWORD_CONFIRMATION_MS).toISOString()
  return repo.claimPasswordConfirmed(db, sessionId, since, new Date(now).toISOString())
}

/** For routes behind requireAuth: refuses the request unless the password
    was just confirmed. */
export function requireRecentPassword(db: Database, res: Response): void {
  if (!claimRecentPassword(db, currentSession(res).sessionId)) {
    throw forbidden('password_confirmation_required', 'Enter your password again to continue.')
  }
}
