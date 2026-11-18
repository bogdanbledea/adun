import { transaction, type Database } from '../../db.ts'
import type { Logger } from '../../lib/log.ts'
import { passwords } from './password.ts'
import * as repo from './repository.ts'
import { startSession } from './service.ts'
import { consumeToken, invalidToken, peekToken } from './tokens.ts'

/* Choosing a new password with the link from the "forgot password" email.
   Only used with email on.

   The link proves the mailbox, so it is all that is asked for. The new
   password ends every session of the account, so whoever knew the old one is
   signed out everywhere, and the browser that used the link is signed in
   afresh. It also ends any lockout and confirms an unconfirmed address: this
   is how the owner of a mailbox takes over an account someone else
   registered with it. */

/** Sets the new password and starts a session, returning its account and the
    cookie value. */
export async function resetPassword(
  db: Database,
  log: Logger,
  token: string,
  password: string,
): Promise<{ userId: string; sessionToken: string }> {
  // Checked first, so a bad link costs no hash.
  if (!peekToken(db, token, 'password_reset')) throw invalidToken()
  const passwordHash = await passwords.hash(password)

  const userId = transaction(db, () => {
    const used = consumeToken(db, token, 'password_reset')
    if (!used) return null
    const now = new Date().toISOString()
    repo.setPasswordHash(db, used.userId, passwordHash, now)
    repo.revokeUserSessions(db, used.userId, now)
    return used.userId
  })
  // Used or replaced while the password was being hashed.
  if (!userId) throw invalidToken()

  log.info({ userId }, 'auth.password_reset')
  return { userId, sessionToken: startSession(db, userId) }
}
