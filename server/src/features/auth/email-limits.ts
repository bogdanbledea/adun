import { transaction, type Database } from '../../db.ts'
import type { Logger } from '../../lib/log.ts'
import * as repo from './repository.ts'

/* Limits on the emails anyone can ask the server to send to an address
   (confirmation, reset, "account exists"), so nobody can flood someone's
   inbox: at most one a minute, and a few a day per kind. The kinds are
   counted apart, so requests of one kind cannot use up another's share. */

const MINUTE = 60 * 1000
const DAY = 24 * 60 * MINUTE

export const EMAILS_PER_DAY: Record<repo.AuthEmailKind, number> = { verification: 5, reset: 5, notice: 1 }

/** Counts one email towards the address's limit for this kind, or says which
    limit stops it. */
export function mayEmail(
  db: Database,
  log: Logger,
  userId: string,
  kind: repo.AuthEmailKind,
): 'yes' | 'minute_limit' | 'day_limit' {
  const now = Date.now()
  return transaction(db, () => {
    const recent = repo.recentAuthEmails(db, userId, kind, new Date(now - DAY).toISOString())
    const latest = recent[0]
    const limit =
      recent.length >= EMAILS_PER_DAY[kind]
        ? 'day_limit'
        : latest && Date.parse(latest) > now - MINUTE
          ? 'minute_limit'
          : null
    if (limit) {
      log.info({ userId, kind, limit }, 'auth.email_limited')
      return limit
    }
    repo.recordAuthEmail(db, userId, kind, new Date(now).toISOString())
    return 'yes'
  })
}
