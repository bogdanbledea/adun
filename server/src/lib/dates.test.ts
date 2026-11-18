import assert from 'node:assert/strict'
import { test } from 'node:test'
import { addDays, addMonths } from './dates.ts'

test('months are counted across years', () => {
  assert.equal(addMonths('2026-11', 2), '2027-01')
  assert.equal(addMonths('2026-01', 0), '2026-01')
  assert.equal(addMonths('2026-01', -1), '2025-12')
  assert.equal(addMonths('9999-01', 11), '9999-12')
})

test('days are counted across months, years and leap days', () => {
  assert.equal(addDays('2026-11-30', 1), '2026-12-01')
  assert.equal(addDays('2026-12-31', 1), '2027-01-01')
  assert.equal(addDays('2028-03-01', -1), '2028-02-29')
  // The night the clocks go back is still one day.
  assert.equal(addDays('2026-10-25', 1), '2026-10-26')
})
