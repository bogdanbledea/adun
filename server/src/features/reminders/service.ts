import { randomUUID } from 'node:crypto'
import { transaction, type Database } from '../../db.ts'
import { badRequest, notFound } from '../../http/errors.ts'
import { LIMITS, limitReached } from '../../lib/limits.ts'
import { logActivity } from '../activity/service.ts'
import * as repo from './repository.ts'

/* Reminders: due dates such as a car's ITP or insurance.
   - A reminder has a kind, a name, an optional subject and note, a due date
     in the years 2000–2100, an optional repeat of 1–120 months, and 1–5
     lead days of 0–365, kept sorted and without repeats (default [3]).
   - Renewing moves the due date: to the date given, or for a repeating
     reminder by its interval, as many times as it takes to pass today. The
     client says which day it is, so the server needs no time zone. A
     reminder that does not repeat needs a date. Renewing turns it back on.
   - Emails come from the hourly sweep; everything here works the same
     with email off.
   - An account holds at most LIMITS.reminders reminders.
   - Each change and its activity entry are one transaction. */

export type Reminder = repo.ReminderRow

export const DEFAULT_LEAD_DAYS = [3]
export const LAST_YEAR = 2100

const reminderNotFound = () => notFound('reminder_not_found', 'Reminder not found.')

/** Sorted and without repeats. */
export function normalizeLeadDays(days: number[]): number[] {
  return [...new Set(days)].sort((a, b) => a - b)
}

/** Months later, kept within the month: 31 January plus one month is the
    last day of February, not 3 March. */
export function addMonthsTo(date: string, months: number): string {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number]
  const target = new Date(Date.UTC(year, month - 1 + months, 1))
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(day, lastDay))
  return target.toISOString().slice(0, 10)
}

/** One interval on, and more while that is still today or earlier, so a
    reminder left alone for years does not land in the past. */
export function nextDueDate(dueDate: string, intervalMonths: number, today: string): string {
  let next = addMonthsTo(dueDate, intervalMonths)
  while (next <= today) next = addMonthsTo(next, intervalMonths)
  return next
}

function requireReminder(db: Database, userId: string, id: string): Reminder {
  const reminder = repo.findReminder(db, userId, id)
  if (!reminder) throw reminderNotFound()
  return reminder
}

export function listReminders(db: Database, userId: string): Reminder[] {
  return repo.listReminders(db, userId)
}

export interface ReminderInput {
  kind: repo.ReminderKind
  name: string
  subject: string | null
  dueDate: string
  intervalMonths: number | null
  leadDays: number[]
  notes: string | null
}

export function createReminder(db: Database, userId: string, input: ReminderInput): Reminder {
  return transaction(db, () => {
    if (repo.countReminders(db, userId) >= LIMITS.reminders) throw limitReached()
    const id = randomUUID()
    repo.insertReminder(db, {
      ...input,
      leadDays: normalizeLeadDays(input.leadDays),
      isActive: true,
      id,
      userId,
      now: new Date().toISOString(),
    })
    logActivity(db, userId, 'reminder.created', { name: input.name, kind: input.kind, dueDate: input.dueDate })
    return requireReminder(db, userId, id)
  })
}

/** Changes the fields given; the others keep their values. */
export function updateReminder(
  db: Database,
  userId: string,
  id: string,
  changes: Partial<ReminderInput> & { isActive?: boolean },
): Reminder {
  return transaction(db, () => {
    const current = requireReminder(db, userId, id)
    const leadDays = changes.leadDays ? normalizeLeadDays(changes.leadDays) : current.leadDays
    repo.updateReminder(db, userId, id, { ...current, ...changes, leadDays })
    logActivity(db, userId, 'reminder.updated', { name: changes.name ?? current.name })
    return requireReminder(db, userId, id)
  })
}

export function renewReminder(
  db: Database,
  userId: string,
  id: string,
  { dueDate, today }: { dueDate?: string; today: string },
): Reminder {
  return transaction(db, () => {
    const current = requireReminder(db, userId, id)
    // A date given wins: the new document rarely starts the day the old one ended.
    let next = dueDate
    if (!next) {
      if (!current.intervalMonths) {
        throw badRequest('reminder_not_repeating', 'This reminder does not repeat; choose its new date.')
      }
      next = nextDueDate(current.dueDate, current.intervalMonths, today)
    }
    if (Number(next.slice(0, 4)) > LAST_YEAR) throw badRequest('invalid_input', 'Invalid value: dueDate.')
    repo.renewReminder(db, userId, id, next)
    logActivity(db, userId, 'reminder.renewed', { name: current.name, from: current.dueDate, to: next })
    return requireReminder(db, userId, id)
  })
}

export function deleteReminder(db: Database, userId: string, id: string): void {
  transaction(db, () => {
    const current = requireReminder(db, userId, id)
    repo.deleteReminder(db, userId, id)
    logActivity(db, userId, 'reminder.deleted', { name: current.name, kind: current.kind })
  })
}
