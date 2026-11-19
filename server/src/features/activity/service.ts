import type { Database } from '../../db.ts'
import * as repo from './repository.ts'
import type { ActivityMetadata } from './repository.ts'

/* The activity history shown in the settings.
   - An entry is written in the same transaction as the change it describes:
     both happen, or neither. logActivity refuses to run outside one.
   - Entries are kept 365 days, and at most ACTIVITY_MAX_ENTRIES per account
     (the oldest go first). The user can also erase the whole history. */

export const ACTIVITY_RETENTION_DAYS = 365
export const ACTIVITY_MAX_ENTRIES = 5000

export type ActivityAction =
  | 'account.renamed'
  | 'account.password_changed'
  | 'account.password_reset'
  | 'account.password_reset_by_admin'
  | 'account.logged_out_everywhere'
  | 'month.created'
  | 'month.deleted'
  | 'month.cleared'
  | 'month.imported'
  | 'entry.created'
  | 'entry.updated'
  | 'entry.moved'
  | 'entry.deleted'
  | 'plan.created'
  | 'plan.closed'
  | 'plan.deleted'
  | 'reminder.created'
  | 'reminder.updated'
  | 'reminder.renewed'
  | 'reminder.deleted'
  | 'food.budget_set'
  | 'food.budget_deleted'
  | 'food.purchase_added'
  | 'food.purchase_updated'
  | 'food.purchase_deleted'
  | 'food.purchases_cleared'
  | 'food.period_rule_set'
  | 'food.shared'
  | 'food.share_resolved'
  | 'calendar.day_set'
  | 'calendar.day_reset'
  | 'family.created'
  | 'family.renamed'
  | 'family.invite_created'
  | 'family.joined'
  | 'family.owner_transferred'
  | 'family.left'
  | 'family.dissolved'
  | 'data.exported'
  | 'data.imported'

/** Records an action, with what it was about when that helps the user
    recognise it. Call it inside the transaction that makes the change. */
export function logActivity(db: Database, userId: string, action: ActivityAction, metadata?: ActivityMetadata): void {
  if (!db.isTransaction) throw new Error('logActivity must run inside the transaction that makes the change')
  repo.insertActivity(db, userId, action, metadata ?? null, new Date().toISOString())
  repo.trimActivity(db, userId, ACTIVITY_MAX_ENTRIES)
}
