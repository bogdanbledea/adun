import { transaction, type Database } from '../db.ts'
import { deleteActivityBefore } from '../features/activity/repository.ts'
import { ACTIVITY_RETENTION_DAYS } from '../features/activity/service.ts'
import { deleteAuthEmailsBefore, deleteDeadSessions, deleteDeadTokens } from '../features/auth/repository.ts'
import { REARM_WINDOW_MS } from '../features/auth/tokens.ts'
import type { Logger } from '../lib/log.ts'

/* Once at startup and then once a day: removes activity older than 365 days,
   sessions that expired or were revoked, email links that were used or can
   no longer be used or re-armed, and email send records older than a day.
   None of these can be used again, so removing them changes nothing the user
   can see; it only stops the database keeping what it no longer needs. */

const DAY_MS = 24 * 60 * 60 * 1000

export interface CleanupResult {
  activity: number
  sessions: number
  tokens: number
  authEmails: number
}

export function runCleanup(db: Database, now = Date.now()): CleanupResult {
  const iso = (ms: number) => new Date(ms).toISOString()
  return transaction(db, () => ({
    activity: deleteActivityBefore(db, iso(now - ACTIVITY_RETENTION_DAYS * DAY_MS)),
    sessions: deleteDeadSessions(db, iso(now)),
    tokens: deleteDeadTokens(db, iso(now), iso(now - REARM_WINDOW_MS)),
    authEmails: deleteAuthEmailsBefore(db, iso(now - DAY_MS)),
  }))
}

/** Runs the cleanup now and every 24 hours; returns a function that stops it. */
export function startDailyCleanup(db: Database, log: Logger): () => void {
  const run = () => {
    try {
      log.info({ ...runCleanup(db) }, 'job.cleanup')
    } catch (error) {
      log.error({ err: error }, 'job.cleanup_failed')
    }
  }
  run()
  const timer = setInterval(run, DAY_MS)
  timer.unref()
  return () => {
    clearInterval(timer)
  }
}
