import { randomBytes } from 'node:crypto'
import { transaction, type Database } from '../../db.ts'
import type { Logger } from '../../lib/log.ts'
import { logActivity } from '../activity/service.ts'
import { passwordProblem, passwords } from './password.ts'
import * as repo from './repository.ts'

/* A new password set by whoever runs the server, for a server with email off,
   where "forgot password" cannot send a link. It does what a reset by link
   does: ends every session, any lockout and any reset link still out, and
   confirms an unconfirmed address, since the administrator vouches for the
   person asking. The owner sees it in the activity history. */

// Four groups of five random characters, e.g. kQ3x_-Zp9aR-…, drawn again
// until it meets the password rules. About 120 bits.
export function generatePassword(): string {
  for (;;) {
    const raw = randomBytes(15).toString('base64url')
    const candidate = [0, 5, 10, 15].map((start) => raw.slice(start, start + 5)).join('-')
    if (!passwordProblem(candidate)) return candidate
  }
}

/** Gives the account a new random password and returns it, or null when no
    account has the address. */
export async function resetPasswordByAdmin(
  db: Database,
  log: Logger,
  email: string,
): Promise<{ email: string; password: string } | null> {
  const account = repo.findCredentials(db, email.trim().toLowerCase())
  if (!account) return null
  const password = generatePassword()
  const passwordHash = await passwords.hash(password)
  transaction(db, () => {
    const now = new Date().toISOString()
    repo.setPasswordHash(db, account.id, passwordHash, now)
    repo.revokeUserSessions(db, account.id, now)
    repo.deleteTokens(db, account.id, 'password_reset')
    logActivity(db, account.id, 'account.password_reset_by_admin')
  })
  log.info({ userId: account.id }, 'auth.password_reset_by_admin')
  return { email: account.email, password }
}
