import type { Database } from '../../db.ts'

/* SQL for reminders and the sweep's notification records. Every function
   that reads or writes one user's reminders takes the user ID and filters by
   it. The sweep's functions work across users, as the job they serve does. */

export const REMINDER_KINDS = ['itp', 'rca', 'casco', 'rovinieta', 'revizie_gaz', 'extinctor', 'altele'] as const

export type ReminderKind = (typeof REMINDER_KINDS)[number]

export interface ReminderFields {
  kind: ReminderKind
  name: string
  subject: string | null
  dueDate: string
  intervalMonths: number | null
  leadDays: number[]
  notes: string | null
  isActive: boolean
}

export interface ReminderRow extends ReminderFields {
  id: string
  createdAt: string
}

const COLUMNS = 'id, kind, name, subject, due_date, interval_months, lead_days, notes, is_active, created_at'

function toReminderRow(row: Record<string, unknown>): ReminderRow {
  return {
    id: row.id as string,
    kind: row.kind as ReminderKind,
    name: row.name as string,
    subject: row.subject as string | null,
    dueDate: row.due_date as string,
    intervalMonths: row.interval_months as number | null,
    leadDays: JSON.parse(row.lead_days as string) as number[],
    notes: row.notes as string | null,
    isActive: row.is_active === 1,
    createdAt: row.created_at as string,
  }
}

/** Active ones first, then the nearest due date. */
export function listReminders(db: Database, userId: string): ReminderRow[] {
  return db
    .prepare(`SELECT ${COLUMNS} FROM reminders WHERE user_id = ? ORDER BY is_active DESC, due_date, created_at, rowid`)
    .all(userId)
    .map(toReminderRow)
}

export function findReminder(db: Database, userId: string, id: string): ReminderRow | null {
  const row = db.prepare(`SELECT ${COLUMNS} FROM reminders WHERE id = ? AND user_id = ?`).get(id, userId)
  return row ? toReminderRow(row) : null
}

export function countReminders(db: Database, userId: string): number {
  return db.prepare('SELECT count(*) AS n FROM reminders WHERE user_id = ?').get(userId)?.n as number
}

export function insertReminder(db: Database, reminder: ReminderFields & { id: string; userId: string; now: string }): void {
  db.prepare(
    `INSERT INTO reminders (id, user_id, kind, name, subject, due_date, interval_months, lead_days, notes, is_active,
                            created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    reminder.id,
    reminder.userId,
    reminder.kind,
    reminder.name,
    reminder.subject,
    reminder.dueDate,
    reminder.intervalMonths,
    JSON.stringify(reminder.leadDays),
    reminder.notes,
    Number(reminder.isActive),
    reminder.now,
  )
}

/** Writes every field; the caller merges the changes into the current row. */
export function updateReminder(db: Database, userId: string, id: string, fields: ReminderFields): void {
  db.prepare(
    `UPDATE reminders
     SET kind = ?, name = ?, subject = ?, due_date = ?, interval_months = ?, lead_days = ?, notes = ?, is_active = ?
     WHERE id = ? AND user_id = ?`,
  ).run(
    fields.kind,
    fields.name,
    fields.subject,
    fields.dueDate,
    fields.intervalMonths,
    JSON.stringify(fields.leadDays),
    fields.notes,
    Number(fields.isActive),
    id,
    userId,
  )
}

/** Moves the due date and turns the reminder back on. */
export function renewReminder(db: Database, userId: string, id: string, dueDate: string): void {
  db.prepare('UPDATE reminders SET due_date = ?, is_active = 1 WHERE id = ? AND user_id = ?').run(dueDate, id, userId)
}

/** Its notification records go with it (ON DELETE CASCADE). */
export function deleteReminder(db: Database, userId: string, id: string): void {
  db.prepare('DELETE FROM reminders WHERE id = ? AND user_id = ?').run(id, userId)
}

// The sweep

export interface SweepCandidate {
  id: string
  userId: string
  kind: ReminderKind
  name: string
  subject: string | null
  dueDate: string
  leadDays: number[]
  email: string
  displayName: string
  emailVerified: boolean
}

/** Active reminders of every user, due today or later. */
export function sweepCandidates(db: Database, today: string): SweepCandidate[] {
  return db
    .prepare(
      `SELECT r.id, r.user_id, r.kind, r.name, r.subject, r.due_date, r.lead_days,
              u.email, u.display_name, u.email_verified_at
       FROM reminders r JOIN users u ON u.id = r.user_id
       WHERE r.is_active = 1 AND r.due_date >= ?
       ORDER BY r.due_date, r.rowid`,
    )
    .all(today)
    .map((row) => ({
      id: row.id as string,
      userId: row.user_id as string,
      kind: row.kind as ReminderKind,
      name: row.name as string,
      subject: row.subject as string | null,
      dueDate: row.due_date as string,
      leadDays: JSON.parse(row.lead_days as string) as number[],
      email: row.email as string,
      displayName: row.display_name as string,
      emailVerified: row.email_verified_at !== null,
    }))
}

export interface Checkpoint {
  reminderId: string
  userId: string
  dueDate: string
  leadDays: number
}

/** Records a checkpoint as handled and not sent. Returns its ID, or null when
    it was claimed before: only the first claim may send. */
export function claimCheckpoint(db: Database, checkpoint: Checkpoint, now: string): number | null {
  const row = db
    .prepare(
      `INSERT INTO reminder_notifications (reminder_id, user_id, due_date, lead_days, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (reminder_id, due_date, lead_days) DO NOTHING
       RETURNING id`,
    )
    .get(checkpoint.reminderId, checkpoint.userId, checkpoint.dueDate, checkpoint.leadDays, now)
  return row ? (row.id as number) : null
}

export function markSent(db: Database, notificationId: number): void {
  db.prepare('UPDATE reminder_notifications SET was_sent = 1 WHERE id = ?').run(notificationId)
}
