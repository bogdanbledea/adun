import { transaction, type Database } from '../../db.ts'
import type { Logger } from '../../lib/log.ts'
import { passwords } from './password.ts'
import * as repo from './repository.ts'
import { passwordMatches, wrongPassword } from './service.ts'

/* Changing the password from the settings, with the current one.

   A wrong current password counts towards the lockout, as at sign-in, so a
   session left open on a shared computer cannot be used to guess it. The new
   password ends every other session, so whoever knew the old one is signed
   out, and unused reset links stop working; this browser stays signed in. */

export async function changePassword(
  db: Database,
  log: Logger,
  { userId, sessionId }: { userId: string; sessionId: string },
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  if (!(await passwordMatches(db, log, userId, currentPassword, 'auth.change_password_failed'))) {
    throw wrongPassword()
  }
  const passwordHash = await passwords.hash(newPassword)
  transaction(db, () => {
    const now = new Date().toISOString()
    repo.setPasswordHash(db, userId, passwordHash, now)
    repo.revokeUserSessions(db, userId, now, sessionId)
    repo.deleteTokens(db, userId, 'password_reset')
  })
  log.info({ userId }, 'auth.password_changed')
}
