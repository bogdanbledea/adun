import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { describe, test } from 'node:test'
import { createUser } from '../../../test/auth.ts'
import { tempDatabase } from '../../../test/helpers.ts'
import * as repo from './repository.ts'

/* Reminders keep their own data in shape, and a checkpoint can be claimed
   only once, which is what keeps the sweep from sending an email twice. */

const { db } = tempDatabase()
await createUser(db, 'ana@example.com')
await createUser(db, 'ion@example.com', 'Ion Ionescu')

const idOf = (email: string) => (db.prepare('SELECT id FROM users WHERE email = ?').get(email) as { id: string }).id
const anaId = idOf('ana@example.com')
const ionId = idOf('ion@example.com')
const now = new Date().toISOString()

function addReminder(userId: string, fields: Partial<repo.ReminderFields> = {}): string {
  const id = randomUUID()
  repo.insertReminder(db, {
    kind: 'itp',
    name: 'ITP Logan',
    subject: null,
    dueDate: '2026-12-01',
    intervalMonths: 24,
    leadDays: [7, 30],
    notes: null,
    isActive: true,
    ...fields,
    id,
    userId,
    now,
  })
  return id
}

const checkpoint = (reminderId: string, userId = anaId) => ({ reminderId, userId, dueDate: '2026-12-01', leadDays: 7 })

describe('reminders', () => {
  test('have one of the known kinds', () => {
    assert.doesNotThrow(() => addReminder(anaId, { kind: 'altele' }))
    assert.throws(() => addReminder(anaId, { kind: 'parking' as repo.ReminderKind }), /CHECK constraint failed/)
  })

  test('are due between the years 2000 and 2100', () => {
    assert.doesNotThrow(() => addReminder(anaId, { dueDate: '2100-12-31' }))
    for (const dueDate of ['1999-12-31', '2101-01-01', '1 December']) {
      assert.throws(() => addReminder(anaId, { dueDate }), /CHECK constraint failed/, dueDate)
    }
  })

  test('repeat every 1 to 120 months, or not at all', () => {
    assert.doesNotThrow(() => addReminder(anaId, { intervalMonths: null }))
    assert.doesNotThrow(() => addReminder(anaId, { intervalMonths: 120 }))
    for (const intervalMonths of [0, 121]) {
      assert.throws(() => addReminder(anaId, { intervalMonths }), /CHECK constraint failed/, String(intervalMonths))
    }
  })

  test('warn 1 to 5 times', () => {
    assert.doesNotThrow(() => addReminder(anaId, { leadDays: [1, 3, 7, 14, 30] }))
    for (const leadDays of [[], [1, 3, 7, 14, 30, 60]]) {
      assert.throws(() => addReminder(anaId, { leadDays }), /CHECK constraint failed/, JSON.stringify(leadDays))
    }
  })

  test('are listed active first, then by the nearest due date', () => {
    addReminder(ionId, { name: 'RCA', dueDate: '2027-03-01' })
    addReminder(ionId, { name: 'Extinctor', dueDate: '2026-01-15', isActive: false })
    addReminder(ionId, { name: 'ITP', dueDate: '2026-12-01' })
    assert.deepEqual(
      repo.listReminders(db, ionId).map((reminder) => reminder.name),
      ['ITP', 'RCA', 'Extinctor'],
    )
  })

  test('are found, changed and deleted only by their own user', () => {
    const id = addReminder(anaId)
    assert.equal(repo.findReminder(db, ionId, id), null)

    repo.renewReminder(db, ionId, id, '2028-12-01')
    repo.deleteReminder(db, ionId, id)
    assert.equal(repo.findReminder(db, anaId, id)?.dueDate, '2026-12-01')
  })

  test('are turned back on when renewed', () => {
    const id = addReminder(anaId, { isActive: false })
    repo.renewReminder(db, anaId, id, '2028-12-01')
    const renewed = repo.findReminder(db, anaId, id)
    assert.ok(renewed)
    assert.equal(renewed.dueDate, '2028-12-01')
    assert.equal(renewed.isActive, true)
  })
})

describe('checkpoints', () => {
  test('can be claimed only once', () => {
    const reminder = addReminder(anaId)
    const first = repo.claimCheckpoint(db, checkpoint(reminder), now)
    assert.equal(typeof first, 'number')
    assert.equal(repo.claimCheckpoint(db, checkpoint(reminder), now), null)
    // Another lead time, or the same one after a renewal, is a new checkpoint.
    assert.notEqual(repo.claimCheckpoint(db, { ...checkpoint(reminder), leadDays: 30 }, now), null)
    assert.notEqual(repo.claimCheckpoint(db, { ...checkpoint(reminder), dueDate: '2028-12-01' }, now), null)
  })

  test('are recorded as sent only when marked', () => {
    const id = repo.claimCheckpoint(db, checkpoint(addReminder(anaId)), now)
    const wasSent = () => db.prepare('SELECT was_sent FROM reminder_notifications WHERE id = ?').get(id)?.was_sent
    assert.equal(wasSent(), 0)
    repo.markSent(db, id as number)
    assert.equal(wasSent(), 1)
  })

  test('cannot point at another user’s reminder', () => {
    const ionReminder = addReminder(ionId)
    assert.throws(() => repo.claimCheckpoint(db, checkpoint(ionReminder, anaId), now), /FOREIGN KEY constraint failed/)
  })

  test('go with their reminder', () => {
    const reminder = addReminder(anaId)
    repo.claimCheckpoint(db, checkpoint(reminder), now)
    repo.deleteReminder(db, anaId, reminder)
    assert.equal(db.prepare('SELECT count(*) AS n FROM reminder_notifications WHERE reminder_id = ?').get(reminder)?.n, 0)
  })
})

describe('the sweep', () => {
  test('sees active reminders due today or later, with their owner', async () => {
    const { db: own } = tempDatabase()
    await createUser(own, 'ana@example.com')
    const userId = (own.prepare('SELECT id FROM users').get() as { id: string }).id
    const add = (name: string, dueDate: string, isActive = true) => {
      repo.insertReminder(own, {
        kind: 'rca',
        name,
        subject: 'B 123 ABC',
        dueDate,
        intervalMonths: 12,
        leadDays: [3],
        notes: null,
        isActive,
        id: randomUUID(),
        userId,
        now,
      })
    }
    add('Past', '2026-11-17')
    add('Today', '2026-11-18')
    add('Off', '2026-11-20', false)
    add('Later', '2026-12-01')

    const candidates = repo.sweepCandidates(own, '2026-11-18')
    assert.deepEqual(candidates.map((reminder) => reminder.name), ['Today', 'Later'])
    assert.deepEqual(
      { ...candidates[0], id: undefined },
      {
        id: undefined,
        userId,
        kind: 'rca',
        name: 'Today',
        subject: 'B 123 ABC',
        dueDate: '2026-11-18',
        leadDays: [3],
        email: 'ana@example.com',
        displayName: 'Ana Popescu',
        language: 'ro',
        emailVerified: true,
      },
    )
  })
})

test('deleting a user removes their reminders and checkpoints', async () => {
  await createUser(db, 'maria@example.com', 'Maria Pop')
  const mariaId = idOf('maria@example.com')
  repo.claimCheckpoint(db, checkpoint(addReminder(mariaId), mariaId), now)

  db.prepare('DELETE FROM users WHERE id = ?').run(mariaId)
  for (const table of ['reminders', 'reminder_notifications']) {
    assert.equal(db.prepare(`SELECT count(*) AS n FROM ${table} WHERE user_id = ?`).get(mariaId)?.n, 0, table)
  }
})
