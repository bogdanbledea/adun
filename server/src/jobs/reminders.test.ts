import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { describe, test } from 'node:test'
import { createUser, EMAIL_ENV } from '../../test/auth.ts'
import { captureLogger, tempDatabase, testConfig } from '../../test/helpers.ts'
import { memoryMailer, type Mailer } from '../email/mailer.ts'
import { silentLogger } from '../lib/log.ts'
import { clockIn, runReminderSweep, selectLeadDays, startReminderSweep } from './reminders.ts'

const { db, dataDir } = tempDatabase()
const emailOn = testConfig(dataDir, EMAIL_ENV)
const emailOff = testConfig(dataDir)

// 10:00 in Bucharest.
const NOW = new Date('2026-11-18T08:00:00Z')
const at = (day: string) => new Date(`${day}T08:00:00Z`)

async function user(email: string, fields: { language?: string; verified?: boolean } = {}): Promise<string> {
  await createUser(db, email)
  const id = (db.prepare('SELECT id FROM users WHERE email = ?').get(email) as { id: string }).id
  db.prepare('UPDATE users SET language = ? WHERE id = ?').run(fields.language ?? 'ro', id)
  if (fields.verified === false) db.prepare('UPDATE users SET email_verified_at = NULL WHERE id = ?').run(id)
  return id
}

function reminder(userId: string, fields: { dueDate?: string; leadDays?: number[]; isActive?: boolean } = {}): string {
  const id = randomUUID()
  db.prepare(
    `INSERT INTO reminders (id, user_id, kind, name, subject, due_date, lead_days, is_active, created_at)
     VALUES (?, ?, 'itp', 'ITP Logan', 'B 123 ABC', ?, ?, ?, ?)`,
  ).run(
    id,
    userId,
    fields.dueDate ?? '2026-11-25',
    JSON.stringify(fields.leadDays ?? [7, 30]),
    Number(fields.isActive ?? true),
    NOW.toISOString(),
  )
  return id
}

const records = (reminderId: string) =>
  db
    .prepare('SELECT lead_days, was_sent FROM reminder_notifications WHERE reminder_id = ? ORDER BY lead_days')
    .all(reminderId)
    .map((row) => ({ ...row }))

const sweep = (mailer: Mailer, now = NOW, config = emailOn) => runReminderSweep(db, mailer, config, silentLogger, now)

test('the day and hour are read in the time zone set', () => {
  assert.deepEqual(clockIn('Europe/Bucharest', new Date('2026-11-18T05:59:00Z')), { today: '2026-11-18', hour: 7 })
  assert.deepEqual(clockIn('Europe/Bucharest', new Date('2026-11-17T22:30:00Z')), { today: '2026-11-18', hour: 0 })
  // Summer time.
  assert.deepEqual(clockIn('Europe/Bucharest', new Date('2026-07-01T05:00:00Z')), { today: '2026-07-01', hour: 8 })
  assert.deepEqual(clockIn('America/New_York', new Date('2026-11-18T03:00:00Z')), { today: '2026-11-17', hour: 22 })
})

describe('the checkpoint to email', () => {
  test('is the smallest lead time already reached', () => {
    assert.deepEqual(selectLeadDays([7, 30], '2026-12-31', '2026-11-18'), { send: null, skip: [] })
    assert.deepEqual(selectLeadDays([7, 30], '2026-12-18', '2026-11-18'), { send: 30, skip: [] })
    assert.deepEqual(selectLeadDays([30, 7], '2026-11-25', '2026-11-18'), { send: 7, skip: [30] })
    assert.deepEqual(selectLeadDays([0, 3], '2026-11-18', '2026-11-18'), { send: 0, skip: [3] })
  })

  test('is none once the due date has passed', () => {
    assert.deepEqual(selectLeadDays([7], '2026-11-17', '2026-11-18'), { send: null, skip: [] })
  })
})

describe('the sweep', () => {
  test('waits for 08:00', async () => {
    const id = reminder(await user('early@example.com'))
    const mailer = memoryMailer()
    const result = await sweep(mailer, new Date('2026-11-18T05:30:00Z'))
    assert.equal(result.skipped, 'before_send_hour')
    assert.equal(mailer.sent.length, 0)
    assert.deepEqual(records(id), [])
  })

  test('emails the latest checkpoint once, and marks the larger one skipped', async () => {
    const id = reminder(await user('ana@example.com'))
    const mailer = memoryMailer()
    await sweep(mailer)
    const sent = mailer.sent.filter((email) => email.to === 'ana@example.com')
    assert.equal(sent.length, 1)
    const [email] = sent
    assert.ok(email)
    assert.equal(email.kind, 'reminder_due')
    assert.equal(email.subject, 'ITP Logan expiră în 7 zile')
    assert.ok(email.text.includes(`${emailOn.appUrl}/scadente`))
    assert.deepEqual(records(id), [
      { lead_days: 7, was_sent: 1 },
      { lead_days: 30, was_sent: 0 },
    ])

    // An hour later, or after a restart, nothing more goes.
    await sweep(mailer, new Date('2026-11-18T09:00:00Z'))
    assert.equal(mailer.sent.filter((email) => email.to === 'ana@example.com').length, 1)
  })

  test('emails each checkpoint as its day comes', async () => {
    const id = reminder(await user('ion@example.com'), { dueDate: '2026-12-18' })
    const mailer = memoryMailer()
    const sentTo = () => mailer.sent.filter((email) => email.to === 'ion@example.com').map((email) => email.subject)
    await sweep(mailer)
    await sweep(mailer, at('2026-11-30'))
    await sweep(mailer, at('2026-12-11'))
    await sweep(mailer, at('2026-12-12'))
    assert.deepEqual(sentTo(), ['ITP Logan expiră în 30 de zile', 'ITP Logan expiră în 7 zile'])
    assert.deepEqual(records(id), [
      { lead_days: 7, was_sent: 1 },
      { lead_days: 30, was_sent: 1 },
    ])
  })

  test('writes in the account’s language', async () => {
    reminder(await user('john@example.com', { language: 'en' }))
    const mailer = memoryMailer()
    await sweep(mailer)
    assert.equal(mailer.sent.find((email) => email.to === 'john@example.com')?.subject, 'ITP Logan is due in 7 days')
  })

  test('leaves out reminders that are off or past due', async () => {
    const userId = await user('off@example.com')
    const off = reminder(userId, { isActive: false })
    const past = reminder(userId, { dueDate: '2026-11-17' })
    const mailer = memoryMailer()
    await sweep(mailer)
    assert.equal(mailer.sent.filter((email) => email.to === 'off@example.com').length, 0)
    assert.deepEqual([...records(off), ...records(past)], [])
  })

  test('with email off, records the checkpoint as not sent, and does not send it later', async () => {
    const id = reminder(await user('quiet@example.com'))
    const mailer = memoryMailer()
    const result = await sweep(mailer, NOW, emailOff)
    assert.ok(result.emailOff >= 1)
    assert.deepEqual(records(id), [
      { lead_days: 7, was_sent: 0 },
      { lead_days: 30, was_sent: 0 },
    ])
    await sweep(mailer)
    assert.equal(mailer.sent.filter((email) => email.to === 'quiet@example.com').length, 0)
  })

  test('does not email an address that is not confirmed', async () => {
    const id = reminder(await user('new@example.com', { verified: false }))
    const mailer = memoryMailer()
    await sweep(mailer)
    assert.equal(mailer.sent.filter((email) => email.to === 'new@example.com').length, 0)
    assert.deepEqual(records(id)[0], { lead_days: 7, was_sent: 0 })
  })

  test('does not try a failed email again', async () => {
    const id = reminder(await user('fail@example.com'))
    const failing = memoryMailer('failed')
    assert.ok((await sweep(failing)).failed >= 1)
    assert.deepEqual(records(id)[0], { lead_days: 7, was_sent: 0 })

    const working = memoryMailer()
    await sweep(working, new Date('2026-11-18T09:00:00Z'))
    assert.equal(working.sent.filter((email) => email.to === 'fail@example.com').length, 0)
  })

  test('logs IDs and dates, never the address or the reminder’s text', async () => {
    reminder(await user('logged@example.com'))
    const { log, lines } = captureLogger()
    await runReminderSweep(db, memoryMailer(), emailOn, log, NOW)
    const logged = JSON.stringify(lines)
    assert.ok(lines.some((line) => line.msg === 'reminders.notification_sent'))
    for (const secret of ['logged@example.com', 'ITP Logan', 'B 123 ABC']) assert.ok(!logged.includes(secret), secret)
  })
})

test('stopping waits for a sweep in progress', async () => {
  reminder(await user('slow@example.com'))
  let release = () => {}
  let finished = false
  const slow: Mailer = {
    send: () =>
      new Promise((resolve) => {
        release = () => {
          finished = true
          resolve('sent')
        }
      }),
  }
  const stop = startReminderSweep(db, slow, emailOn, silentLogger, () => NOW)
  const stopped = stop()
  // Let the sweep reach the mail server, then let the mail server answer.
  await new Promise((resolve) => setImmediate(resolve))
  release()
  await stopped
  assert.equal(finished, true)
})
