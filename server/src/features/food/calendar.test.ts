import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { appClient, createUser, signIn } from '../../../test/auth.ts'
import { tempDatabase } from '../../../test/helpers.ts'
import { LIMITS } from '../../lib/limits.ts'

const { db, dataDir } = tempDatabase()
await createUser(db, 'ana@example.com')
await createUser(db, 'ion@example.com', 'Ion Ionescu')

const client = await appClient(db, dataDir)
const ana = await signIn(client, 'ana@example.com')
const ion = await signIn(client, 'ion@example.com')
const anaId = (db.prepare("SELECT id FROM users WHERE email = 'ana@example.com'").get() as { id: string }).id

interface Day {
  date: string
  holiday: string | null
  legal: boolean
  override: 'off' | 'working' | null
  note: string | null
  isWorkingDay: boolean
}

interface Year {
  year: number
  rule: string
  paydayWorkingDay: number
  days: Day[]
  paydays: { monthKey: string; date: string }[]
}

const send = (method: string, path: string, cookie: string, body?: unknown) =>
  client.request(method, path, { body, headers: { cookie } })
const year = async (y: number, cookie = ana) => (await (await send('GET', `/api/food/calendar/${String(y)}`, cookie)).json()) as Year
const dayOf = async (date: string, cookie = ana) => (await year(Number(date.slice(0, 4)), cookie)).days.find((d) => d.date === date)
const setDay = (date: string, body: unknown, cookie = ana) => send('PUT', `/api/food/calendar/${date}`, cookie, body)
const lastActivity = () =>
  db.prepare('SELECT action, metadata FROM activity_logs WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(anaId)

await send('PATCH', '/api/user/me', ana, { foodPeriodRule: 'working_day', foodPaydayWorkingDay: 3 })

describe('a year of the working calendar', () => {
  test('lists the legal holidays and the paydays', async () => {
    const y = await year(2026)
    assert.deepEqual([y.year, y.rule, y.paydayWorkingDay], [2026, 'working_day', 3])
    assert.equal(y.days.length, 17)
    assert.deepEqual(y.days[0], {
      date: '2026-01-01',
      holiday: 'new_year',
      legal: true,
      override: null,
      note: null,
      isWorkingDay: false,
    })
    assert.deepEqual(y.paydays.slice(10), [
      { monthKey: '2026-11', date: '2026-11-04' },
      { monthKey: '2026-12', date: '2026-12-04' },
    ])
  })

  test('is known from 2024 to 2099', async () => {
    for (const y of ['2023', '2100', 'next']) {
      assert.equal((await send('GET', `/api/food/calendar/${y}`, ana)).status, 400, y)
    }
  })
})

describe('correcting a day', () => {
  test('adds a day off with its note, moves the payday and records it', async () => {
    assert.equal((await setDay('2026-11-03', { kind: 'off', note: ' Concediu ' })).status, 200)
    assert.deepEqual(await dayOf('2026-11-03'), {
      date: '2026-11-03',
      holiday: null,
      legal: false,
      override: 'off',
      note: 'Concediu',
      isWorkingDay: false,
    })
    assert.equal((await year(2026)).paydays[10]?.date, '2026-11-05')
    assert.deepEqual({ ...lastActivity() }, {
      action: 'calendar.day_set',
      metadata: JSON.stringify({ date: '2026-11-03', kind: 'off' }),
    })
  })

  test('moves the period of a month without a budget, not of one with', async () => {
    const read = async (monthKey: string) =>
      ((await (await send('GET', `/api/food/${monthKey}?today=2026-11-18`, ana)).json()) as { period: { start: string } }).period.start
    await send('PUT', '/api/food/2027-02/sources?today=2026-11-18', ana, { sources: [{ name: 'Card', amountBani: 1 }] })
    const february = await read('2027-02')
    await setDay('2027-02-01', { kind: 'off' })
    await setDay('2027-03-02', { kind: 'off' })
    assert.equal(await read('2027-02'), february)
    assert.equal(await read('2027-03'), '2027-03-04')
  })

  test('can make a holiday a working day; setting a day again replaces it', async () => {
    await setDay('2026-12-01', { kind: 'working' })
    const day = await dayOf('2026-12-01')
    assert.deepEqual([day?.holiday, day?.legal, day?.override, day?.isWorkingDay], ['national_day', true, 'working', true])
    assert.equal((await year(2026)).paydays[11]?.date, '2026-12-03')
    await setDay('2026-12-01', { kind: 'off', note: null })
    assert.equal((await dayOf('2026-12-01'))?.override, 'off')
  })

  test('back to the legal default, and records it once', async () => {
    await setDay('2026-12-24', { kind: 'off' })
    assert.equal((await send('DELETE', '/api/food/calendar/2026-12-24', ana)).status, 200)
    assert.equal(await dayOf('2026-12-24'), undefined)
    assert.deepEqual({ ...lastActivity() }, { action: 'calendar.day_reset', metadata: JSON.stringify({ date: '2026-12-24' }) })
    await send('DELETE', '/api/food/calendar/2026-12-24', ana)
    assert.equal(lastActivity()?.action, 'calendar.day_reset')
    assert.equal(
      db.prepare("SELECT count(*) AS n FROM activity_logs WHERE action = 'calendar.day_reset' AND user_id = ?").get(anaId)?.n,
      1,
    )
  })

  test('refuses what is out of bounds', async () => {
    for (const [date, body] of [
      ['2026-11-10', { kind: 'holiday' }],
      ['2026-11-10', { kind: 'off', note: 'x'.repeat(65) }],
      ['2023-12-31', { kind: 'off' }],
      ['10-11-2026', { kind: 'off' }],
    ] as const) {
      assert.equal((await setDay(date, body)).status, 400, `${date} ${JSON.stringify(body)}`)
    }
  })

  test('stops at the account’s limit, keeping a day already set changeable', async () => {
    await createUser(db, 'maria@example.com', 'Maria Pop')
    const maria = await signIn(client, 'maria@example.com')
    const mariaId = (db.prepare("SELECT id FROM users WHERE email = 'maria@example.com'").get() as { id: string }).id
    const insert = db.prepare(
      "INSERT INTO work_calendar_overrides (user_id, date, kind, created_at) VALUES (?, ?, 'off', '2026-11-18T10:00:00Z')",
    )
    for (let i = 0; i < LIMITS.calendarDays; i++) {
      const date = new Date(Date.UTC(2030, 0, 1 + i)).toISOString().slice(0, 10)
      insert.run(mariaId, date)
    }
    const res = await setDay('2026-11-10', { kind: 'off' }, maria)
    assert.equal(res.status, 409)
    assert.equal((await setDay('2030-01-01', { kind: 'working' }, maria)).status, 200)
  })
})

test('another user sees and changes none of the corrections', async () => {
  await setDay('2027-05-05', { kind: 'off', note: 'Ana' })
  assert.equal(await dayOf('2027-05-05', ion), undefined)
  await send('DELETE', '/api/food/calendar/2027-05-05', ion)
  assert.equal((await dayOf('2027-05-05'))?.note, 'Ana')
})

test('deleting a user removes their corrections', () => {
  db.prepare('DELETE FROM users WHERE id = ?').run(anaId)
  assert.equal(db.prepare('SELECT count(*) AS n FROM work_calendar_overrides WHERE user_id = ?').get(anaId)?.n, 0)
})
