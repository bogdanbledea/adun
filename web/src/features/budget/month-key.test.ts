import { expect, test } from 'vitest'
import {
  currentMonthKey,
  isMonthKey,
  monthKeyToParam,
  monthLong,
  monthName,
  monthRange,
  monthShort,
  paramToMonthKey,
  shiftMonth,
} from './month-key.ts'

test('a key is a year and a month from 01 to 12', () => {
  expect(isMonthKey('2026-11')).toBe(true)
  for (const bad of ['2026-13', '2026-00', '2026-1', '26-11', '2026-11-01']) expect(isMonthKey(bad)).toBe(false)
})

test('the URL writes a month as MM-YY', () => {
  expect(monthKeyToParam('2026-11')).toBe('11-26')
  expect(paramToMonthKey('01-27')).toBe('2027-01')
  for (const bad of ['13-26', '00-26', '1-26', '2026-11', '11-2026']) expect(paramToMonthKey(bad)).toBeNull()
})

test('the current month comes from the local date', () => {
  expect(currentMonthKey(new Date(2026, 0, 31, 23, 59))).toBe('2026-01')
})

test('shifting crosses years both ways', () => {
  expect(shiftMonth('2026-12', 1)).toBe('2027-01')
  expect(shiftMonth('2026-01', -1)).toBe('2025-12')
})

test('a range runs from the months before to the months after', () => {
  expect(monthRange('2026-01', 2, 1)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02'])
})

test('names read naturally in both languages', () => {
  expect(monthLong('2026-11', 'ro')).toBe('Noiembrie 2026')
  expect(monthLong('2026-11', 'en')).toBe('November 2026')
  expect(monthName('2026-11', 'ro')).toBe('noiembrie')
  expect(monthShort('2026-01', 'ro', '2026')).toBe('Ian')
  expect(monthShort('2027-01', 'ro', '2026')).toBe("Ian '27")
  expect(monthShort('2026-09', 'en', '2026')).toBe('Sept')
})
