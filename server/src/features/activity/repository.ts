import type { Database } from '../../db.ts'

/* SQL for the activity history. */

export interface ActivityEntry {
  id: number
  action: string
  createdAt: string
}

export function insertActivity(db: Database, userId: string, action: string, now: string): void {
  db.prepare('INSERT INTO activity_logs (user_id, action, created_at) VALUES (?, ?, ?)').run(userId, action, now)
}

/** Drops the user's entries beyond the newest `keep`. */
export function trimActivity(db: Database, userId: string, keep: number): void {
  db.prepare(
    `DELETE FROM activity_logs WHERE id IN (
       SELECT id FROM activity_logs WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT -1 OFFSET ?
     )`,
  ).run(userId, keep)
}

/** Newest first. */
export function listActivity(db: Database, userId: string, limit: number, offset: number): ActivityEntry[] {
  return db
    .prepare(
      `SELECT id, action, created_at FROM activity_logs WHERE user_id = ?
       ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
    )
    .all(userId, limit, offset)
    .map((row) => ({ id: row.id as number, action: row.action as string, createdAt: row.created_at as string }))
}

export function deleteUserActivity(db: Database, userId: string): number {
  return Number(db.prepare('DELETE FROM activity_logs WHERE user_id = ?').run(userId).changes)
}

/** Removes every user's entries older than `before`. */
export function deleteActivityBefore(db: Database, before: string): number {
  return Number(db.prepare('DELETE FROM activity_logs WHERE created_at < ?').run(before).changes)
}
