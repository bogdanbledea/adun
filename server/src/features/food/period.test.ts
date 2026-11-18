import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkStart, currentFoodMonth, ruleStart } from './period.ts'

test('a month starts on the 1st, or on the N-th working day', () => {
  assert.equal(ruleStart('2026-11', { rule: 'calendar', paydayWorkingDay: 3 }), '2026-11-01')
  assert.equal(ruleStart('2026-11', { rule: 'working_day', paydayWorkingDay: 3 }), '2026-11-04')
  const overrides = new Map([['2026-11-03', 'off']] as const)
  assert.equal(ruleStart('2026-11', { rule: 'working_day', paydayWorkingDay: 3, overrides }), '2026-11-05')
})

test('a start set by hand lies between the previous month’s 15th and this month’s 28th', () => {
  const around = { previousStart: '2026-10-01', nextStart: '2026-12-01' }
  assert.equal(checkStart('2026-11', '2026-10-15', around), null)
  assert.equal(checkStart('2026-11', '2026-11-28', around), null)
  assert.equal(checkStart('2026-11', '2026-10-14', around), 'out_of_range')
  assert.equal(checkStart('2026-11', '2026-11-29', around), 'out_of_range')
  // Across a year.
  assert.equal(checkStart('2027-01', '2026-12-20', { previousStart: '2026-12-01', nextStart: '2027-02-01' }), null)
})

test('a start set by hand does not reach the neighbouring months’ starts', () => {
  assert.equal(checkStart('2026-11', '2026-10-20', { previousStart: '2026-10-20', nextStart: '2026-12-01' }), 'before_previous')
  assert.equal(checkStart('2026-11', '2026-11-25', { previousStart: '2026-10-01', nextStart: '2026-11-25' }), 'after_next')
})

test('today belongs to the latest month whose start has come', () => {
  const starts = new Map([
    ['2026-09', '2026-09-03'],
    ['2026-10', '2026-10-05'],
    ['2026-11', '2026-11-04'],
  ])
  assert.equal(currentFoodMonth('2026-10-04', starts), '2026-09')
  assert.equal(currentFoodMonth('2026-10-05', starts), '2026-10')
  assert.equal(currentFoodMonth('2026-10-28', new Map([...starts, ['2026-11', '2026-10-28']])), '2026-11')
})
