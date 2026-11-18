import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { accountExists, firstNameOf, passwordReset, verifyEmail, type Language } from './templates.ts'

const URL = 'https://adun.example.com/verifica-email#token=abc'

describe('firstNameOf', () => {
  test('keeps the first word, letters only', () => {
    assert.equal(firstNameOf('  Ana-Maria Popescu '), 'Ana-Maria')
    assert.equal(firstNameOf("D'Artagnan"), "D'Artagnan")
    assert.equal(firstNameOf('Ștefănică'), 'Ștefănică')
  })

  test('drops what could carry a link, an address or markup', () => {
    assert.equal(firstNameOf('evil.example.com/login'), 'evilexamplecomlogin')
    assert.equal(firstNameOf('<b>Ana</b>'), 'bAnab')
    assert.equal(firstNameOf('ana@example.com'), 'anaexamplecom')
    assert.equal(firstNameOf('https://x'), 'httpsx')
    assert.equal(firstNameOf('1234'), '')
    assert.equal(firstNameOf('A'.repeat(100)).length, 40)
  })
})

describe('emails', () => {
  const all = (language: Language) => [
    verifyEmail(language, { displayName: 'Ana Popescu', url: URL }),
    passwordReset(language, { displayName: 'Ana Popescu', url: URL }),
    accountExists(language, { displayName: 'Ana Popescu', signInUrl: URL, resetUrl: URL }),
  ]

  test('each has a subject, and its link in both the text and the HTML', () => {
    for (const language of ['ro', 'en'] as const) {
      for (const email of all(language)) {
        assert.ok(email.subject.length > 0)
        assert.ok(email.text.includes(URL), email.subject)
        assert.ok(email.html.includes(`href="${URL}"`), email.subject)
        assert.ok(email.html.includes(`<html lang="${language}">`), email.subject)
      }
    }
  })

  test('are written in the language asked for', () => {
    assert.equal(verifyEmail('ro', { displayName: 'Ana', url: URL }).subject, 'Confirmă adresa de email')
    assert.equal(verifyEmail('en', { displayName: 'Ana', url: URL }).subject, 'Confirm your email address')
    assert.match(passwordReset('ro', { displayName: 'Ana', url: URL }).text, /^Bună, Ana,/)
    assert.match(passwordReset('en', { displayName: 'Ana', url: URL }).text, /^Hi Ana,/)
  })

  test('greet without a name when nothing usable is left of it', () => {
    assert.match(verifyEmail('ro', { displayName: '123', url: URL }).text, /^Bună,\n/)
    assert.match(verifyEmail('en', { displayName: '123', url: URL }).text, /^Hi,\n/)
  })

  test('escape what goes into the HTML', () => {
    const email = verifyEmail('en', { displayName: 'Ana', url: 'https://adun.example.com/?a="><script>' })
    assert.doesNotMatch(email.html, /<script>/)
    assert.ok(email.html.includes('&quot;&gt;&lt;script&gt;'))
  })
})
