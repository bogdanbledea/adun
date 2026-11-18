import type { Database } from '../../db.ts'
import * as repo from './repository.ts'

/* The activity history shown in the settings.
   - An entry is written in the same transaction as the change it describes:
     both happen, or neither. logActivity refuses to run outside one.
   - Entries are kept 365 days, and at most ACTIVITY_MAX_ENTRIES per account
     (the oldest go first). The user can also erase the whole history. */

export const ACTIVITY_RETENTION_DAYS = 365
export const ACTIVITY_MAX_ENTRIES = 5000

export type ActivityAction = 'account.renamed' | 'account.password_changed' | 'account.logged_out_everywhere'

/** Records an action. Call it inside the transaction that makes the change. */
export function logActivity(db: Database, userId: string, action: ActivityAction): void {
  if (!db.isTransaction) throw new Error('logActivity must run inside the transaction that makes the change')
  repo.insertActivity(db, userId, action, new Date().toISOString())
  repo.trimActivity(db, userId, ACTIVITY_MAX_ENTRIES)
}
