import { timingSafeEqual } from 'node:crypto'
import { transaction, type Database } from '../../db.ts'
import { badRequest } from '../../http/errors.ts'
import type { Logger } from '../../lib/log.ts'
import * as repo from './repository.ts'
import { passwordMatches, startSession, wrongPassword } from './service.ts'
import { consumeToken, peekToken } from './tokens.ts'

/* Confirming an address with the link from the email. Only used with email on.

   The link carries its token in the fragment (#token=), which browsers do not
   send to the server, so proxies and request logs never see it; the page
   posts it here.

   A link works alone only in the browser that registered (session.ts, the
   sign-up cookie). Anywhere else it also needs the account's password, and
   only then confirms the address and signs in. Otherwise the owner of a
   mailbox, opening a link they did not ask for, would confirm an account
   someone else registered with their address and hand that person a working
   account in their name. */

// Both are SHA-256 hex digests.
const sameHash = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))

export const invalidToken = () => badRequest('invalid_token', 'This link is not valid any more.')

/** Confirms the address and starts a session, returning its account and the
    cookie value, when `browserHash` is that of the browser that registered or
    else with the account's `password`. Without either it returns null and the
    link stays unused. A wrong password counts towards the lockout and leaves
    the link unused too. */
export async function confirmEmail(
  db: Database,
  log: Logger,
  token: string,
  browserHash: string | null,
  password: string | null,
): Promise<{ userId: string; sessionToken: string } | null> {
  const found = peekToken(db, token, 'email_verification')
  if (!found) throw invalidToken()

  const sameBrowser = browserHash !== null && found.browserHash !== null && sameHash(browserHash, found.browserHash)
  if (!sameBrowser) {
    if (password === null) return null
    if (!(await passwordMatches(db, log, found.userId, password, 'auth.confirm_password_failed'))) {
      throw wrongPassword()
    }
  }

  const used = transaction(db, () => {
    const consumed = consumeToken(db, token, 'email_verification')
    if (consumed) repo.markEmailVerified(db, consumed.userId, new Date().toISOString())
    return consumed
  })
  // Used or replaced while the password was being checked.
  if (!used) throw invalidToken()

  log.info({ userId: used.userId, withPassword: !sameBrowser }, 'auth.email_confirmed')
  return { userId: used.userId, sessionToken: startSession(db, used.userId) }
}
