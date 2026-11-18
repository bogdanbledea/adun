import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { appClient, createUser, signIn } from '../../../test/auth.ts'
import { tempDatabase } from '../../../test/helpers.ts'

const { db, dataDir } = tempDatabase()
await createUser(db, 'ana@example.com')
await createUser(db, 'ion@example.com', 'Ion Ionescu')

const client = await appClient(db, dataDir)
const ana = await signIn(client, 'ana@example.com')
const ion = await signIn(client, 'ion@example.com')
const anaId = (db.prepare("SELECT id FROM users WHERE email = 'ana@example.com'").get() as { id: string }).id

interface Month {
  period: { start: string; end: string; ruleStart: string; rule: string }
  sources: { id: string; name: string; amountBani: number }[]
}

const send = (method: string, path: string, cookie: string, body?: unknown) =>
  client.request(method, path, { body, headers: { cookie } })
const codeOf = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code
const read = async (monthKey: string, cookie = ana) =>
  (await (await send('GET', `/api/food/${monthKey}?today=2026-11-18`, cookie)).json()) as Month
const periodOf = async (monthKey: string, cookie = ana) => (await read(monthKey, cookie)).period
const save = (monthKey: string, body: Record<string, unknown> = {}, cookie = ana) =>
  send('PUT', `/api/food/${monthKey}/sources?today=2026-11-18`, cookie, { sources: [{ name: 'Card', amountBani: 100000 }], ...body })
const setRule = (body: Record<string, unknown>, cookie = ana) => send('PATCH', '/api/user/me', cookie, body)
const current = async (today: string, cookie = ana) =>
  ((await (await send('GET', `/api/food/current?today=${today}`, cookie)).json()) as { monthKey: string }).monthKey
const periodActivities = () =>
  db.prepare("SELECT metadata FROM activity_logs WHERE user_id = ? AND action = 'food.period_rule_set' ORDER BY id").all(anaId)

describe('the pay-period rule', () => {
  test('is the 1st of the month until changed', async () => {
    const me = (await (await send('GET', '/api/user/me', ana)).json()) as Record<string, unknown>
    assert.deepEqual([me.foodPeriodRule, me.foodPaydayWorkingDay], ['calendar', 3])
    assert.deepEqual(await periodOf('2026-11'), { start: '2026-11-01', end: '2026-11-30', ruleStart: '2026-11-01', rule: 'calendar' })
  })

  test('is changed in the account and recorded when it changes', async () => {
    const res = await setRule({ foodPeriodRule: 'working_day', foodPaydayWorkingDay: 5 })
    const me = (await res.json()) as Record<string, unknown>
    assert.deepEqual([me.foodPeriodRule, me.foodPaydayWorkingDay], ['working_day', 5])
    await setRule({ foodPaydayWorkingDay: 5 })
    await setRule({ foodPaydayWorkingDay: 3 })
    assert.deepEqual(
      periodActivities().map((row) => row.metadata),
      [JSON.stringify({ rule: 'working_day', paydayWorkingDay: 5 }), JSON.stringify({ rule: 'working_day', paydayWorkingDay: 3 })],
    )
  })

  test('refuses values outside the rules', async () => {
    for (const body of [{ foodPeriodRule: 'weekly' }, { foodPaydayWorkingDay: 0 }, { foodPaydayWorkingDay: 11 }, {}]) {
      assert.equal((await setRule(body)).status, 400, JSON.stringify(body))
    }
  })

  test('opens a new month on the N-th working day, which the month keeps', async () => {
    await setRule({ foodPeriodRule: 'working_day', foodPaydayWorkingDay: 3 })
    // 1 December is National Day: the 3rd working day is Friday the 4th. In
    // January the 1st, 2nd, 6th and 7th are holidays: it is the 8th.
    assert.deepEqual(await periodOf('2026-12'), {
      start: '2026-12-04',
      end: '2027-01-07',
      ruleStart: '2026-12-04',
      rule: 'working_day',
    })
    await save('2026-12')
    await setRule({ foodPeriodRule: 'calendar' })
    assert.deepEqual(await periodOf('2026-12'), { start: '2026-12-04', end: '2026-12-31', ruleStart: '2026-12-01', rule: 'calendar' })
    // November ends the day before December's start.
    assert.equal((await periodOf('2026-11')).end, '2026-12-03')
  })
})

describe('moving a month’s start', () => {
  test('moves the previous month’s end, and leaving it out keeps it', async () => {
    await save('2027-03', { periodStart: '2027-02-25' })
    assert.equal((await periodOf('2027-03')).start, '2027-02-25')
    assert.equal((await periodOf('2027-02')).end, '2027-02-24')
    await save('2027-03')
    assert.equal((await periodOf('2027-03')).start, '2027-02-25')
    await save('2027-03', { periodStart: '2027-03-01' })
    assert.equal((await periodOf('2027-03')).start, '2027-03-01')
  })

  test('is refused far from the month', async () => {
    for (const periodStart of ['2027-04-14', '2027-05-29']) {
      const res = await save('2027-05', { periodStart })
      assert.equal(res.status, 400, periodStart)
      assert.equal(await codeOf(res), 'food_period_out_of_range')
    }
  })

  test('may not reach the neighbouring months’ starts', async () => {
    assert.equal((await save('2027-06', { periodStart: '2027-06-20' })).status, 200)
    const beforePrevious = await save('2027-07', { periodStart: '2027-06-18' })
    assert.equal(beforePrevious.status, 400)
    assert.equal(await codeOf(beforePrevious), 'food_period_before_previous')

    assert.equal((await save('2027-07', { periodStart: '2027-06-25' })).status, 200)
    const afterNext = await save('2027-06', { periodStart: '2027-06-26' })
    assert.equal(afterNext.status, 400)
    assert.equal(await codeOf(afterNext), 'food_period_after_next')
  })

  test('is refused when a purchase would fall outside its period', async () => {
    await save('2028-08')
    const july = (await (await save('2028-07')).json()) as Month
    for (const spentOn of ['2028-07-02', '2028-07-20']) {
      const res = await send('POST', '/api/food/2028-07/purchases', ana, {
        merchant: 'Lidl',
        amountBani: 100,
        spentOn,
        sourceId: july.sources[0]?.id,
      })
      assert.equal(res.status, 201)
    }
    // July's purchase on the 2nd would come before July's start.
    const late = await save('2028-07', { periodStart: '2028-07-03' })
    assert.equal(late.status, 409)
    assert.equal(await codeOf(late), 'food_purchases_outside_period')
    // The one on the 20th would come after July's end.
    const early = await save('2028-08', { periodStart: '2028-07-16' })
    assert.equal(early.status, 409)
    assert.equal(await codeOf(early), 'food_purchases_outside_period')
    assert.equal((await save('2028-08', { periodStart: '2028-07-21' })).status, 200)
  })

  test('also works on the first save', async () => {
    const res = await save('2029-01', { periodStart: '2028-12-20' })
    assert.equal(res.status, 200)
    assert.equal(((await res.json()) as Month).period.start, '2028-12-20')
  })
})

describe('the current month', () => {
  test('is the calendar month under the calendar rule', async () => {
    assert.equal(await current('2026-11-01', ion), '2026-11')
    assert.equal(await current('2026-11-30', ion), '2026-11')
  })

  test('is the previous month until payday under the payday rule', async () => {
    await setRule({ foodPeriodRule: 'working_day', foodPaydayWorkingDay: 3 }, ion)
    // 1 December 2026 is National Day; payday is Friday the 4th.
    assert.equal(await current('2026-12-03', ion), '2026-11')
    assert.equal(await current('2026-12-04', ion), '2026-12')
  })

  test('follows a start moved by hand', async () => {
    await setRule({ foodPeriodRule: 'calendar' }, ion)
    await save('2026-10', { periodStart: '2026-09-28' }, ion)
    assert.equal(await current('2026-09-28', ion), '2026-10')
    assert.equal(await current('2026-09-27', ion), '2026-09')
  })

  test('needs the client’s date', async () => {
    assert.equal((await send('GET', '/api/food/current', ana)).status, 400)
  })
})
