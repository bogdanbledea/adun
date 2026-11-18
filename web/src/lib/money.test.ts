import { describe, expect, test } from 'vitest'
import { baniToInput, formatBani, formatLei, MAX_BANI, parseAmount } from './money.ts'

describe('parseAmount', () => {
  test.each([
    ['12', 1200],
    ['0', 0],
    ['12,5', 1250],
    ['12.50', 1250],
    ['12,05', 1205],
    ['1.234,50', 123_450],
    ['1,234.50', 123_450],
    ['1 234,50', 123_450],
    ['1234', 123_400],
    ['1.234', 123_400],
    ['1.234.567', 123_456_700],
    [' 45,99 lei ', 4599],
    ['9999999999', MAX_BANI],
  ])('reads "%s" as %i bani', (text, bani) => {
    expect(parseAmount(text)).toBe(bani)
  })

  test.each(['', 'abc', '-5', '12,345,6', '1,234,5', '1.234,567', '12.3.4', '1.2,3', '12,', ',5', '10000000000', '1e3'])(
    'refuses "%s"',
    (text) => {
      expect(parseAmount(text)).toBeNull()
    },
  )
})

describe('formatBani', () => {
  test('writes lei in the language’s style', () => {
    expect(formatBani(123_450, 'ro')).toBe('1.234,50 lei')
    expect(formatBani(123_450, 'en')).toBe('1,234.50 lei')
    expect(formatBani(5, 'en')).toBe('0.05 lei')
    expect(formatBani(-1250, 'ro')).toBe('-12,50 lei')
  })

  test('leaves the decimals out of whole lei, and keeps both otherwise', () => {
    expect(formatBani(150_000, 'ro')).toBe('1.500 lei')
    expect(formatBani(300_010, 'ro')).toBe('3.000,10 lei')
    expect(formatBani(0, 'en')).toBe('0 lei')
  })

  test('formatLei leaves the unit out', () => {
    expect(formatLei(123_450, 'ro')).toBe('1.234,50')
  })

  test('keeps every bani of the largest amount', () => {
    expect(formatBani(MAX_BANI, 'en')).toBe('9,999,999,999 lei')
    expect(formatBani(MAX_BANI - 1, 'en')).toBe('9,999,999,998.99 lei')
  })
})

test('baniToInput gives back text that parseAmount reads', () => {
  expect(baniToInput(123_450, 'ro')).toBe('1234,50')
  expect(baniToInput(123_450, 'en')).toBe('1234.50')
  expect(baniToInput(150_000, 'ro')).toBe('1500')
  expect(parseAmount(baniToInput(99, 'ro'))).toBe(99)
})
