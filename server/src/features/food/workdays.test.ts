import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isWorkingDay, legalHolidays, nthWorkingDay, orthodoxEaster } from './workdays.ts'

test('Orthodox Easter is found', () => {
  assert.equal(orthodoxEaster(2024), '2024-05-05')
  assert.equal(orthodoxEaster(2025), '2025-04-20')
  assert.equal(orthodoxEaster(2026), '2026-04-12')
  assert.equal(orthodoxEaster(2027), '2027-05-02')
  assert.equal(orthodoxEaster(2028), '2028-04-16')
})

test('the legal holidays are listed in date order, the movable ones around Easter', () => {
  assert.deepEqual(
    legalHolidays(2026).map((h) => `${h.date} ${h.holiday}`),
    [
      '2026-01-01 new_year',
      '2026-01-02 new_year',
      '2026-01-06 epiphany',
      '2026-01-07 st_john',
      '2026-01-24 union_day',
      '2026-04-10 good_friday',
      '2026-04-12 easter',
      '2026-04-13 easter',
      '2026-05-01 labour_day',
      '2026-05-31 pentecost',
      // Pentecost Monday and Children's Day fall on the same day in 2026.
      '2026-06-01 children_day',
      '2026-06-01 pentecost',
      '2026-08-15 assumption',
      '2026-11-30 st_andrew',
      '2026-12-01 national_day',
      '2026-12-25 christmas',
      '2026-12-26 christmas',
    ],
  )
})

test('a working day is Monday to Friday and not a holiday', () => {
  assert.equal(isWorkingDay('2026-11-16'), true) // Monday
  assert.equal(isWorkingDay('2026-11-14'), false) // Saturday
  assert.equal(isWorkingDay('2026-11-15'), false) // Sunday
  assert.equal(isWorkingDay('2026-11-30'), false) // St Andrew, a Monday
  assert.equal(isWorkingDay('2026-04-10'), false) // Good Friday
})

test('the user’s corrections win over the default', () => {
  const overrides = new Map([
    ['2026-11-16', 'off'],
    ['2026-11-30', 'working'],
    ['2026-11-15', 'working'],
  ] as const)
  assert.equal(isWorkingDay('2026-11-16', overrides), false)
  assert.equal(isWorkingDay('2026-11-30', overrides), true)
  assert.equal(isWorkingDay('2026-11-15', overrides), true)
})

test('the n-th working day of a month is counted', () => {
  // 1 and 2 January are holidays, 3–4 a weekend, 6–7 holidays again.
  assert.equal(nthWorkingDay('2026-01', 1), '2026-01-05')
  assert.equal(nthWorkingDay('2026-01', 3), '2026-01-09')
  // 1 November 2026 is a Sunday.
  assert.equal(nthWorkingDay('2026-11', 3), '2026-11-04')
  // 1 December is National Day.
  assert.equal(nthWorkingDay('2026-12', 3), '2026-12-04')
  assert.equal(nthWorkingDay('2026-11', 10), '2026-11-13')
  assert.throws(() => nthWorkingDay('2026-11', 0), RangeError)
})

test('the n-th working day counts the corrections in', () => {
  assert.equal(nthWorkingDay('2026-11', 3, new Map([['2026-11-03', 'off']])), '2026-11-05')
  assert.equal(nthWorkingDay('2026-12', 3, new Map([['2026-12-01', 'working']])), '2026-12-03')
  assert.equal(nthWorkingDay('2026-11', 1, new Map([['2026-11-01', 'working']])), '2026-11-01')
})
