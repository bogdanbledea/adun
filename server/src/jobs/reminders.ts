import type { Config } from '../config.ts'
import { transaction, type Database } from '../db.ts'
import type { Mailer } from '../email/mailer.ts'
import { reminderDue } from '../email/templates.ts'
import * as repo from '../features/reminders/repository.ts'
import { normalizeLeadDays } from '../features/reminders/service.ts'
import type { Logger } from '../lib/log.ts'

/* Reminder emails. Runs at startup and every hour, and acts only from 08:00
   in TIME_ZONE, so a restart at midday still sends the day's emails.

   - Lead days are checkpoints before the due date. For each active reminder
     not yet past due, the one that matters is the latest checkpoint already
     reached: the smallest lead time whose day has come. That one is emailed;
     larger ones reached at the same time (a reminder added a week before
     its due date, with 30 and 7) are recorded as skipped, so they cannot
     fire late.
   - A checkpoint is claimed by inserting its (reminder, due date, lead days)
     row, and the unique index lets only one claim succeed: each checkpoint
     gets at most one email, across restarts and overlapping runs.
   - With email off, or an address not confirmed, the checkpoint is recorded
     as not sent. A failed send stays recorded as not sent and is not tried
     again, since a second try could be a second email.
   - The log holds IDs, dates and counts: never the address or the
     reminder's own text. */

export const SEND_HOUR = 8
const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

// The calendar day and the hour (0–23) on the wall clock in a time zone.
// "en-CA" is the one common locale that writes dates as YYYY-MM-DD.
export function clockIn(timeZone: string, now: Date): { today: string; hour: number } {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
  const hour = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hourCycle: 'h23' })
  return { today: today.format(now), hour: Number(hour.format(now)) }
}

// Calendar arithmetic on UTC midnights, which have no daylight saving.
const utc = (day: string) => Date.parse(`${day}T00:00:00Z`)
const addDays = (day: string, days: number) => new Date(utc(day) + days * DAY_MS).toISOString().slice(0, 10)
const daysBetween = (from: string, to: string) => Math.round((utc(to) - utc(from)) / DAY_MS)

/** The checkpoint to email today, and the larger ones it makes obsolete. */
export function selectLeadDays(leadDays: number[], dueDate: string, today: string): { send: number | null; skip: number[] } {
  if (today > dueDate) return { send: null, skip: [] }
  const reached = normalizeLeadDays(leadDays).filter((lead) => addDays(dueDate, -lead) <= today)
  return { send: reached[0] ?? null, skip: reached.slice(1) }
}

export interface SweepResult {
  skipped: 'before_send_hour' | null
  candidates: number
  sent: number
  failed: number
  emailOff: number
  unverified: number
  superseded: number
  errors: number
}

export async function runReminderSweep(
  db: Database,
  mailer: Mailer,
  config: Pick<Config, 'appUrl' | 'email' | 'timeZone'>,
  log: Logger,
  now = new Date(),
): Promise<SweepResult> {
  const result: SweepResult = { skipped: null, candidates: 0, sent: 0, failed: 0, emailOff: 0, unverified: 0, superseded: 0, errors: 0 }
  const { today, hour } = clockIn(config.timeZone, now)
  if (hour < SEND_HOUR) return { ...result, skipped: 'before_send_hour' }

  const candidates = repo.sweepCandidates(db, today)
  result.candidates = candidates.length

  for (const reminder of candidates) {
    try {
      await handle(reminder)
    } catch (error) {
      // One bad row must not stop the others.
      result.errors++
      log.error({ err: error, reminderId: reminder.id, userId: reminder.userId }, 'reminders.notification_error')
    }
  }
  return result

  async function handle(reminder: repo.SweepCandidate) {
    const { send, skip } = selectLeadDays(reminder.leadDays, reminder.dueDate, today)
    const checkpoint = (leadDays: number) => ({ reminderId: reminder.id, userId: reminder.userId, dueDate: reminder.dueDate, leadDays })

    const claimed = transaction(db, () => {
      for (const lead of skip) {
        if (repo.claimCheckpoint(db, checkpoint(lead), now.toISOString()) !== null) {
          result.superseded++
          log.info(checkpoint(lead), 'reminders.notification_superseded')
        }
      }
      return send === null ? null : repo.claimCheckpoint(db, checkpoint(send), now.toISOString())
    })
    // Nothing due today, or an earlier run already handled this checkpoint.
    if (claimed === null || send === null) return

    if (!config.email) {
      result.emailOff++
      log.info(checkpoint(send), 'reminders.notification_email_off')
      return
    }
    if (!reminder.emailVerified) {
      result.unverified++
      log.info(checkpoint(send), 'reminders.notification_unverified')
      return
    }

    const email = reminderDue(reminder.language, {
      displayName: reminder.displayName,
      name: reminder.name,
      kind: reminder.kind,
      subject: reminder.subject,
      dueDate: reminder.dueDate,
      daysLeft: daysBetween(today, reminder.dueDate),
      url: `${config.appUrl}/scadente`,
    })
    const outcome = await mailer.send('reminder_due', { to: reminder.email, ...email })
    if (outcome === 'sent') {
      repo.markSent(db, claimed)
      result.sent++
      log.info(checkpoint(send), 'reminders.notification_sent')
    } else {
      result.failed++
      log.error({ ...checkpoint(send), outcome }, 'reminders.notification_failed')
    }
  }
}

/** Runs the sweep now and every hour. Returns a stop function that resolves
    once a run in progress has finished, so shutdown never closes the
    database under a sweep waiting on the mail server. */
export function startReminderSweep(
  db: Database,
  mailer: Mailer,
  config: Config,
  log: Logger,
  clock = () => new Date(),
): () => Promise<void> {
  let running: Promise<void> | null = null
  const run = async () => {
    try {
      const result = await runReminderSweep(db, mailer, config, log, clock())
      if (result.skipped) log.debug({ reason: result.skipped }, 'job.reminders_skipped')
      else log.info({ ...result }, 'job.reminders')
    } catch (error) {
      log.error({ err: error }, 'job.reminders_failed')
    } finally {
      running = null
    }
  }
  // A slow mail server must not let two runs walk the same list at once.
  const start = () => {
    running ??= run()
  }
  start()
  const timer = setInterval(start, HOUR_MS)
  timer.unref()
  return async () => {
    clearInterval(timer)
    await running
  }
}
