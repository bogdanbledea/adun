import { expect, test } from 'vitest'
import { currentMonthKey, isMonthKey, monthName, monthShort, monthsOfYear, shiftMonth } from './month-key.ts'

test('a key is a year and a month from 01 to 12', () => {
  expect(isMonthKey('2026-11')).toBe(true)
  for (const bad of ['2026-13', '2026-00', '2026-1', '26-11', '2026-11-01']) expect(isMonthKey(bad)).toBe(false)
})

test('the current month comes from the local date', () => {
  expect(currentMonthKey(new Date(2026, 0, 31, 23, 59))).toBe('2026-01')
})

test('shifting crosses years both ways', () => {
  expect(shiftMonth('2026-12', 1)).toBe('2027-01')
  expect(shiftMonth('2026-01', -1)).toBe('2025-12')
  expect(shiftMonth('2026-05', 0)).toBe('2026-05')
})

test('a year has twelve months', () => {
  expect(monthsOfYear('2026-07')).toEqual([
    '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06',
    '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12',
  ])
})

test('names read naturally in both languages', () => {
  expect(monthName('2026-11', 'ro')).toBe('Noiembrie 2026')
  expect(monthName('2026-11', 'en')).toBe('November 2026')
  expect(monthShort('2026-01', 'ro')).toBe('Ian')
  expect(monthShort('2026-09', 'en')).toBe('Sept')
})
