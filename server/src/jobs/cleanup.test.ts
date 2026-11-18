import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { createUser } from '../../test/auth.ts'
import { captureLogger, tempDatabase } from '../../test/helpers.ts'
import { runCleanup, startDailyCleanup } from './cleanup.ts'

const { db } = tempDatabase()
await createUser(db, 'ana@example.com')
const anaId = (db.prepare("SELECT id FROM users WHERE email = 'ana@example.com'").get() as { id: string }).id

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const NOW = Date.parse('2026-11-18T12:00:00Z')
const at = (ms: number) => new Date(NOW + ms).toISOString()

let counter = 0
const hash = () => String(++counter).padStart(64, '0')

function addSession(name: string, { expiresIn, revoked = false }: { expiresIn: number; revoked?: boolean }) {
  db.prepare(
    `INSERT INTO sessions (id, user_id, token_hash, expires_at, last_used_at, revoked_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(name, anaId, hash(), at(expiresIn), at(-HOUR), revoked ? at(-HOUR) : null, at(-DAY))
}

function addToken(name: string, { issued, expiresIn, used = false }: { issued: number; expiresIn: number; used?: boolean }) {
  db.prepare(
    `INSERT INTO auth_tokens (id, user_id, purpose, token_hash, expires_at, consumed_at, created_at)
     VALUES (?, ?, 'password_reset', ?, ?, ?, ?)`,
  ).run(name, anaId, hash(), at(expiresIn), used ? at(-HOUR) : null, at(-issued))
}

const ids = (table: string) =>
  db
    .prepare(`SELECT id FROM ${table} ORDER BY id`)
    .all()
    .map((row) => row.id)

describe('runCleanup', () => {
  test('removes only what can no longer be used or is past its retention', () => {
    addSession('live', { expiresIn: DAY })
    addSession('expired', { expiresIn: -1 })
    addSession('revoked', { expiresIn: DAY, revoked: true })

    addToken('unused', { issued: HOUR / 2, expiresIn: HOUR / 2 })
    addToken('used', { issued: HOUR / 2, expiresIn: HOUR / 2, used: true })
    // Expired, but still issued within the day, so a re-arm can revive it.
    addToken('rearmable', { issued: 2 * HOUR, expiresIn: -HOUR })
    addToken('dead', { issued: 2 * DAY, expiresIn: -DAY })

    const insertActivity = db.prepare("INSERT INTO activity_logs (id, user_id, action, created_at) VALUES (?, ?, 'account.renamed', ?)")
    insertActivity.run(1, anaId, at(-364 * DAY))
    insertActivity.run(2, anaId, at(-366 * DAY))

    const insertEmail = db.prepare("INSERT INTO auth_emails (id, user_id, kind, sent_at) VALUES (?, ?, 'reset', ?)")
    insertEmail.run(1, anaId, at(-HOUR))
    insertEmail.run(2, anaId, at(-2 * DAY))

    assert.deepEqual(runCleanup(db, NOW), { activity: 1, sessions: 2, tokens: 2, authEmails: 1 })
    assert.deepEqual(ids('sessions'), ['live'])
    assert.deepEqual(ids('auth_tokens'), ['rearmable', 'unused'])
    assert.deepEqual(ids('activity_logs'), [1])
    assert.deepEqual(ids('auth_emails'), [1])
  })

  test('a second run finds nothing more', () => {
    assert.deepEqual(runCleanup(db, NOW), { activity: 0, sessions: 0, tokens: 0, authEmails: 0 })
  })
})

describe('startDailyCleanup', () => {
  test('runs once at once and logs the counts', () => {
    const { log, lines } = captureLogger()
    const stop = startDailyCleanup(db, log)
    stop()
    const line = lines.find((entry) => entry.msg === 'job.cleanup')
    assert.ok(line)
    assert.deepEqual(
      [line.activity, line.sessions, line.tokens, line.authEmails].map((value) => typeof value),
      ['number', 'number', 'number', 'number'],
    )
  })

  test('logs a failure instead of throwing', () => {
    const { db: closed } = tempDatabase()
    closed.close()
    const { log, lines } = captureLogger()
    startDailyCleanup(closed, log)()
    assert.ok(lines.some((entry) => entry.msg === 'job.cleanup_failed'))
  })
})
