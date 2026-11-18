import assert from 'node:assert/strict'
import { test } from 'node:test'
import { calendarWeeks, planWeeks } from './weeks.ts'

/* The weekly plan of a food month, on November 2026: Sunday the 1st to
   Monday the 30th. */

const NOVEMBER = { start: '2026-11-01', end: '2026-11-30' }
const lei = (n: number) => n * 100
const plan = (total: number, purchases: { spentOn: string; amountBani: number }[], today: string, planFrom = '2026-11-01') =>
  planWeeks(NOVEMBER, total, purchases, { today, planFrom })

test('weeks run Monday to Sunday, clipped to the period', () => {
  assert.deepEqual(
    calendarWeeks(NOVEMBER).map((w) => `${w.start}..${w.end} ${String(w.days)}`),
    [
      '2026-11-01..2026-11-01 1',
      '2026-11-02..2026-11-08 7',
      '2026-11-09..2026-11-15 7',
      '2026-11-16..2026-11-22 7',
      '2026-11-23..2026-11-29 7',
      '2026-11-30..2026-11-30 1',
    ],
  )
})

test('each week gets its share by days, and the weeks add up to the month exactly', () => {
  const { weeks, current } = plan(lei(3000), [], '2026-10-20')
  assert.deepEqual(
    weeks.map((w) => w.allowanceBani),
    [lei(100), lei(700), lei(700), lei(700), lei(700), lei(100)],
  )
  assert.equal(current, null)
  assert.ok(weeks.every((w) => w.state === 'future' && !w.estimated && !w.beforeStart))

  // 2000 lei over 31 days does not divide evenly; the last week takes the remainder.
  const december = planWeeks({ start: '2026-12-01', end: '2026-12-31' }, lei(2000), [], {
    today: '2026-11-20',
    planFrom: '2026-12-01',
  })
  assert.deepEqual(
    december.weeks.map((w) => w.allowanceBani),
    [38710, 45161, 45161, 45161, 25807],
  )
  assert.equal(
    december.weeks.reduce((sum, w) => sum + w.allowanceBani, 0),
    lei(2000),
  )
})

test('a finished week passes on what it left; the running week at least its allowance', () => {
  const purchases = [
    { spentOn: '2026-11-01', amountBani: lei(50) }, // week 1: 50 of 100
    { spentOn: '2026-11-03', amountBani: lei(1000) }, // week 2: well over
    { spentOn: '2026-11-10', amountBani: lei(200) }, // week 3, running
  ]
  const { weeks, current } = plan(lei(3000), purchases, '2026-11-11')
  assert.deepEqual(
    weeks.map((w) => [w.allowanceBani, w.spentBani, w.state, w.estimated]),
    [
      [10000, 5000, 'past', false],
      // 2950 left over 29 days, 7 of them this week.
      [71207, 100000, 'past', false],
      // 1950 left over 22 days.
      [62045, 20000, 'current', false],
      // Counted as if the running week uses all of its 620.45.
      [62046, 0, 'future', true],
      [62045, 0, 'future', true],
      [8864, 0, 'future', true],
    ],
  )
  assert.deepEqual(current && { ...current }, {
    ...weeks[2],
    daysElapsed: 3,
    daysLeft: 5,
    paceBani: 26591,
    perDayLeftBani: 8409,
    status: 'ok',
  })
})

test('the running week is behind past its pace and over past its allowance', () => {
  // Planned from Monday the 9th: week 3 gets 7/22 of 2200 = 700 lei, and two
  // of its seven days have passed, so the pace is 200.
  const at = (amountBani: number) => plan(lei(2200), [{ spentOn: '2026-11-09', amountBani }], '2026-11-10', '2026-11-09').current?.status
  assert.equal(at(lei(200)), 'ok')
  assert.equal(at(lei(200) + 1), 'behind')
  assert.equal(at(lei(700)), 'behind')
  assert.equal(at(lei(700) + 1), 'over')
})

test('overspending the month leaves nothing for the weeks after', () => {
  const { weeks } = plan(lei(1000), [{ spentOn: '2026-11-02', amountBani: lei(1500) }], '2026-11-10')
  assert.deepEqual(
    weeks.slice(2).map((w) => w.allowanceBani),
    [0, 0, 0, 0],
  )
})

test('weeks before the plan starts get nothing; purchases logged in them still count', () => {
  const fresh = plan(lei(3000), [], '2026-11-12', '2026-11-12')
  assert.deepEqual(
    fresh.weeks.map((w) => [w.allowanceBani, w.beforeStart]),
    [
      [0, true],
      [0, true],
      // Funded from Thursday the 12th: 4 of the 19 days left.
      [63158, false],
      [110526, false],
      [110527, false],
      [15789, false],
    ],
  )
  assert.deepEqual([fresh.current?.daysElapsed, fresh.current?.paceBani], [1, 15790])

  const logged = plan(lei(3000), [{ spentOn: '2026-11-05', amountBani: lei(20) }], '2026-11-12', '2026-11-12')
  assert.equal(logged.weeks[2]?.allowanceBani, 62737)
})

test('a plan starting before its period starts plans from the period start', () => {
  assert.deepEqual(plan(lei(3000), [], '2026-10-20', '2026-10-20').weeks, plan(lei(3000), [], '2026-10-20').weeks)
})
