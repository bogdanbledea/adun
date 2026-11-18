import { expect, test } from 'vitest'
import { passwordProblem } from './password.ts'

test('matches the server rules', () => {
  expect(passwordProblem('Scurta-1')).toBe('auth.passwordTooShort')
  expect(passwordProblem(`Aa1-${'x'.repeat(197)}`)).toBe('auth.passwordTooLong')
  expect(passwordProblem('fara-majuscule-1')).toBe('auth.passwordTooSimple')
  expect(passwordProblem('FARA-MINUSCULE-1')).toBe('auth.passwordTooSimple')
  expect(passwordProblem('Fara-cifre-deloc')).toBe('auth.passwordTooSimple')
  expect(passwordProblem('FaraSimboluri12')).toBe('auth.passwordTooSimple')
  expect(passwordProblem('Corect-cal-9')).toBeNull()
})
