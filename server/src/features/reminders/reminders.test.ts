import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { appClient, createUser, signIn } from '../../../test/auth.ts'
import { tempDatabase } from '../../../test/helpers.ts'
import { LIMITS } from '../../lib/limits.ts'
import { addMonthsTo, nextDueDate } from './service.ts'

const { db, dataDir } = tempDatabase()
await createUser(db, 'ana@example.com')
await createUser(db, 'ion@example.com', 'Ion Ionescu')

const client = await appClient(db, dataDir)
const ana = await signIn(client, 'ana@example.com')
const ion = await signIn(client, 'ion@example.com')
const anaId = (db.prepare("SELECT id FROM users WHERE email = 'ana@example.com'").get() as { id: string }).id

interface Reminder {
  id: string
  name: string
  subject: string | null
  dueDate: string
  intervalMonths: number | null
  leadDays: number[]
  notes: string | null
  isActive: boolean
}

const send = (method: string, path: string, cookie: string, body?: unknown) =>
  client.request(method, path, { body, headers: { cookie } })
const codeOf = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code
const create = async (fields: Record<string, unknown> = {}, cookie = ana) => {
  const res = await send('POST', '/api/reminders', cookie, { kind: 'itp', name: 'ITP Logan', dueDate: '2026-12-01', ...fields })
  assert.equal(res.status, 201)
  return (await res.json()) as Reminder
}
const renew = (id: string, body: unknown = {}, today = '2026-11-18', cookie = ana) =>
  send('POST', `/api/reminders/${id}/renew?today=${today}`, cookie, body)
const list = async (cookie = ana) => (await (await send('GET', '/api/reminders', cookie)).json()) as Reminder[]
const lastActivity = () =>
  db.prepare('SELECT action, metadata FROM activity_logs WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(anaId)

test('months are added within the month', () => {
  assert.equal(addMonthsTo('2026-01-31', 1), '2026-02-28')
  assert.equal(addMonthsTo('2028-01-31', 1), '2028-02-29')
  assert.equal(addMonthsTo('2026-11-18', 24), '2028-11-18')
  assert.equal(addMonthsTo('2026-12-15', 1), '2027-01-15')
})

test('a renewed due date lands after today, however long it was left', () => {
  assert.equal(nextDueDate('2026-12-01', 12, '2026-11-18'), '2027-12-01')
  assert.equal(nextDueDate('2020-03-01', 12, '2026-11-18'), '2027-03-01')
  assert.equal(nextDueDate('2025-11-18', 12, '2026-11-18'), '2027-11-18')
})

describe('creating a reminder', () => {
  test('fills in what was left out', async () => {
    const reminder = await create()
    assert.deepEqual(
      { ...reminder, id: undefined, createdAt: undefined },
      {
        id: undefined,
        createdAt: undefined,
        kind: 'itp',
        name: 'ITP Logan',
        subject: null,
        dueDate: '2026-12-01',
        intervalMonths: null,
        leadDays: [3],
        notes: null,
        isActive: true,
      },
    )
    assert.deepEqual({ ...lastActivity() }, {
      action: 'reminder.created',
      metadata: JSON.stringify({ name: 'ITP Logan', kind: 'itp', dueDate: '2026-12-01' }),
    })
  })

  test('keeps the lead days sorted and without repeats', async () => {
    assert.deepEqual((await create({ leadDays: [30, 7, 30] })).leadDays, [7, 30])
  })

  test('refuses what does not fit', async () => {
    for (const fields of [
      { kind: 'parking' },
      { name: '  ' },
      { dueDate: '2026-02-30' },
      { dueDate: '1999-12-31' },
      { dueDate: '2101-01-01' },
      { intervalMonths: 0 },
      { leadDays: [] },
      { leadDays: [1, 2, 3, 4, 5, 6] },
      { leadDays: [366] },
      { notes: 'x'.repeat(513) },
    ]) {
      const res = await send('POST', '/api/reminders', ana, { kind: 'itp', name: 'ITP', dueDate: '2026-12-01', ...fields })
      assert.equal(res.status, 400, JSON.stringify(fields))
      assert.equal(await codeOf(res), 'invalid_input')
    }
  })
})

test('the list shows active reminders first, then the nearest due date', async () => {
  // A user of their own, so the other tests' reminders stay out of the list.
  await createUser(db, 'dan@example.com', 'Dan Pop')
  const dan = await signIn(client, 'dan@example.com')
  await create({ name: 'Later', dueDate: '2027-03-01' }, dan)
  const off = await create({ name: 'Off', dueDate: '2026-11-20' }, dan)
  await create({ name: 'Soon', dueDate: '2026-12-01' }, dan)
  await send('PATCH', `/api/reminders/${off.id}`, dan, { isActive: false })

  assert.deepEqual((await list(dan)).map((reminder) => reminder.name), ['Soon', 'Later', 'Off'])
})

describe('changing a reminder', () => {
  test('changes only the fields given', async () => {
    const reminder = await create({ subject: 'B 123 ABC', intervalMonths: 24, leadDays: [7, 30] })
    const res = await send('PATCH', `/api/reminders/${reminder.id}`, ana, { notes: 'The garage', leadDays: [14, 3] })
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), { ...reminder, notes: 'The garage', leadDays: [3, 14] })
    assert.equal(lastActivity()?.action, 'reminder.updated')
  })

  test('can clear the optional fields and turn it off', async () => {
    const reminder = await create({ subject: 'B 123 ABC', intervalMonths: 12, notes: 'Note' })
    const res = await send('PATCH', `/api/reminders/${reminder.id}`, ana, {
      subject: null,
      intervalMonths: null,
      notes: null,
      isActive: false,
    })
    assert.deepEqual(await res.json(), { ...reminder, subject: null, intervalMonths: null, notes: null, isActive: false })
  })
})

describe('renewing a reminder', () => {
  test('moves a repeating one by its interval, past today, and turns it back on', async () => {
    const reminder = await create({ dueDate: '2024-11-01', intervalMonths: 12 })
    await send('PATCH', `/api/reminders/${reminder.id}`, ana, { isActive: false })
    const res = await renew(reminder.id)
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), { ...reminder, dueDate: '2027-11-01', isActive: true })
    assert.deepEqual({ ...lastActivity() }, {
      action: 'reminder.renewed',
      metadata: JSON.stringify({ name: 'ITP Logan', from: '2024-11-01', to: '2027-11-01' }),
    })
  })

  test('takes the date given instead', async () => {
    const reminder = await create({ intervalMonths: 12 })
    assert.equal(((await (await renew(reminder.id, { dueDate: '2027-12-10' })).json()) as Reminder).dueDate, '2027-12-10')
  })

  test('needs a date for one that does not repeat', async () => {
    const reminder = await create()
    const res = await renew(reminder.id)
    assert.equal(res.status, 400)
    assert.equal(await codeOf(res), 'reminder_not_repeating')
  })

  test('needs the client’s date', async () => {
    const reminder = await create({ intervalMonths: 12 })
    const res = await send('POST', `/api/reminders/${reminder.id}/renew`, ana, {})
    assert.equal(res.status, 400)
  })

  test('cannot move past the year 2100', async () => {
    const reminder = await create({ dueDate: '2100-06-01', intervalMonths: 12 })
    const res = await renew(reminder.id)
    assert.equal(res.status, 400)
    assert.equal(await codeOf(res), 'invalid_input')
  })
})

test('deleting a reminder removes it', async () => {
  const reminder = await create({ name: 'RCA', kind: 'rca' })
  assert.equal((await send('DELETE', `/api/reminders/${reminder.id}`, ana)).status, 200)
  assert.equal((await list()).some((item) => item.id === reminder.id), false)
  assert.deepEqual({ ...lastActivity() }, {
    action: 'reminder.deleted',
    metadata: JSON.stringify({ name: 'RCA', kind: 'rca' }),
  })
})

test('another user gets 404 for each of the first user’s reminders', async () => {
  const reminder = await create()
  for (const res of [
    await send('PATCH', `/api/reminders/${reminder.id}`, ion, { name: 'Mine' }),
    await renew(reminder.id, { dueDate: '2027-01-01' }, '2026-11-18', ion),
    await send('DELETE', `/api/reminders/${reminder.id}`, ion),
  ]) {
    assert.equal(res.status, 404)
    assert.equal(await codeOf(res), 'reminder_not_found')
  }
  assert.deepEqual(await list(ion), [])
  assert.deepEqual((await list()).find((item) => item.id === reminder.id), reminder)
})

test('an account holds a limited number of reminders', async () => {
  await createUser(db, 'maria@example.com', 'Maria Pop')
  const maria = await signIn(client, 'maria@example.com')
  const mariaId = (db.prepare("SELECT id FROM users WHERE email = 'maria@example.com'").get() as { id: string }).id
  const insert = db.prepare(
    "INSERT INTO reminders (id, user_id, kind, name, due_date, created_at) VALUES (?, ?, 'altele', 'R', '2026-12-01', ?)",
  )
  for (let i = 1; i < LIMITS.reminders; i++) insert.run(crypto.randomUUID(), mariaId, new Date().toISOString())

  await create({}, maria)
  const res = await send('POST', '/api/reminders', maria, { kind: 'itp', name: 'One more', dueDate: '2026-12-01' })
  assert.equal(res.status, 409)
  assert.equal(await codeOf(res), 'limit_reached')
})

test('signed out, the reminders are not there', async () => {
  assert.equal((await client.request('GET', '/api/reminders')).status, 401)
})
