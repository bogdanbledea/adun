import assert from 'node:assert/strict'
import { describe, mock, test } from 'node:test'
import { passwordProblem, passwords } from './password.ts'

describe('passwordProblem', () => {
  test('accepts 12 to 200 characters with lower, upper, digit and symbol', () => {
    assert.equal(passwordProblem('Corect-cal-9'), null)
    assert.equal(passwordProblem(`Aa1-${'x'.repeat(196)}`), null)
  })

  test('names what is wrong', () => {
    assert.equal(passwordProblem('Scurta-1'), 'too_short')
    assert.equal(passwordProblem(`Aa1-${'x'.repeat(197)}`), 'too_long')
    assert.equal(passwordProblem('fara-majuscule-1'), 'too_simple')
    assert.equal(passwordProblem('FARA-MINUSCULE-1'), 'too_simple')
    assert.equal(passwordProblem('Fara-cifre-deloc'), 'too_simple')
    assert.equal(passwordProblem('FaraSimboluri12'), 'too_simple')
  })
})

describe('passwords', () => {
  test('hashes with Argon2id and the chosen parameters', async () => {
    const digest = await passwords.hash('Corect-cal-9')
    assert.match(digest, /^\$argon2id\$v=19\$m=19456,t=2,p=1\$/)
  })

  test('verifies the right password and refuses a wrong one', async () => {
    const digest = await passwords.hash('Corect-cal-9')
    assert.equal(await passwords.verify(digest, 'Corect-cal-9'), true)
    assert.equal(await passwords.verify(digest, 'Gresit-cal-9'), false)
  })

  test('a malformed hash is a failed check, not an error', async () => {
    assert.equal(await passwords.verify('not-a-hash', 'Corect-cal-9'), false)
  })

  test('the dummy check costs one real verification', async (t) => {
    const verify = mock.method(passwords, 'verify')
    t.after(() => { verify.mock.restore() })
    await passwords.verifyDummy('Corect-cal-9')
    assert.equal(verify.mock.callCount(), 1)
  })
})
