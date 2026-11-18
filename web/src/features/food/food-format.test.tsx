import { render } from '@testing-library/react'
import { expect, test } from 'vitest'
import { translate, type Language, type Translate } from '../../lib/i18n.tsx'
import { counted, fill, formatRange, isDelivery, percent, sameName } from './food-format.ts'

test('a name is the same whatever its case and spaces', () => {
  expect(sameName(' kaufland', 'Kaufland ')).toBe(true)
  expect(sameName('ȘTEFAN', 'ștefan')).toBe(true)
  expect(sameName('Lidl', 'Mega')).toBe(false)
})

test('a range of days is written once for its month', () => {
  // Intl puts thin spaces around the dash.
  const range = (start: string, end: string, language: 'ro' | 'en') => formatRange(start, end, language).replace(/\s/g, ' ')
  expect(range('2026-11-02', '2026-11-08', 'ro')).toBe('2–8 nov.')
  expect(range('2026-10-26', '2026-11-01', 'ro')).toBe('26 oct. – 1 nov.')
  expect(range('2026-11-30', '2026-11-30', 'ro')).toBe('30 nov.')
  expect(range('2026-11-02', '2026-11-08', 'en')).toBe('2 – 8 Nov')
})

test('a sentence takes elements in place of its placeholders', () => {
  const { container } = render(<p>{fill('rămași din {amount} azi', { amount: <b>20 lei</b> })}</p>)
  expect(container.innerHTML).toBe('<p>rămași din <b>20 lei</b> azi</p>')
})

test('a share stays between 0 and 100', () => {
  expect(percent(50, 200)).toBe(25)
  expect(percent(300, 200)).toBe(100)
  expect(percent(-5, 200)).toBe(0)
  expect(percent(5, 0)).toBe(100)
  expect(percent(0, 0)).toBe(0)
})

test('days are counted with "de" from 20 up in Romanian', () => {
  const t = (language: Language): Translate => (key, params) => translate(language, key, params)
  expect(counted(t('ro'), 'food.count.days', 1)).toBe('1 zi')
  expect(counted(t('ro'), 'food.count.days', 6)).toBe('6 zile')
  expect(counted(t('ro'), 'food.count.days', 21)).toBe('21 de zile')
  expect(counted(t('ro'), 'food.count.days', 101)).toBe('101 zile')
  expect(counted(t('en'), 'food.count.days', 21)).toBe('21 days')
})

test('delivery apps are told apart from shops', () => {
  expect(isDelivery('Bolt Food')).toBe(true)
  expect(isDelivery('glovo')).toBe(true)
  expect(isDelivery('Kaufland')).toBe(false)
})
