import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  accountExists,
  firstNameOf,
  passwordChanged,
  passwordReset,
  reminderDue,
  verifyEmail,
  type Language,
  type ReminderDue,
} from './templates.ts'

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

const REMINDER: ReminderDue = {
  displayName: 'Ana Popescu',
  name: 'ITP Logan',
  kind: 'itp',
  subject: 'B 123 ABC',
  dueDate: '2026-12-01',
  daysLeft: 7,
  url: 'https://adun.example.com/scadente',
}

describe('emails', () => {
  const all = (language: Language) => [
    verifyEmail(language, { displayName: 'Ana Popescu', url: URL }),
    passwordReset(language, { displayName: 'Ana Popescu', url: URL }),
    accountExists(language, { displayName: 'Ana Popescu', signInUrl: URL, resetUrl: URL }),
    passwordChanged(language, { displayName: 'Ana Popescu', resetUrl: URL }),
    reminderDue(language, { ...REMINDER, url: URL }),
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

describe('the reminder email', () => {
  test('says what is due, when, and how long is left', () => {
    const ro = reminderDue('ro', REMINDER)
    assert.equal(ro.subject, 'ITP Logan expiră în 7 zile')
    assert.ok(ro.text.includes('ITP Logan (ITP · B 123 ABC) expiră pe 1 decembrie 2026, în 7 zile.'))
    const en = reminderDue('en', REMINDER)
    assert.equal(en.subject, 'ITP Logan is due in 7 days')
    assert.ok(en.text.includes('ITP Logan (ITP · B 123 ABC) is due on 1 December 2026, in 7 days.'))
  })

  test('counts down to today', () => {
    assert.equal(reminderDue('ro', { ...REMINDER, daysLeft: 1 }).subject, 'ITP Logan expiră mâine')
    assert.equal(reminderDue('ro', { ...REMINDER, daysLeft: 0 }).subject, 'ITP Logan expiră azi')
    assert.equal(reminderDue('ro', { ...REMINDER, daysLeft: 19 }).subject, 'ITP Logan expiră în 19 zile')
    assert.equal(reminderDue('ro', { ...REMINDER, daysLeft: 30 }).subject, 'ITP Logan expiră în 30 de zile')
    assert.equal(reminderDue('ro', { ...REMINDER, daysLeft: 101 }).subject, 'ITP Logan expiră în 101 zile')
    assert.equal(reminderDue('en', { ...REMINDER, daysLeft: 1 }).subject, 'ITP Logan is due tomorrow')
    assert.equal(reminderDue('en', { ...REMINDER, daysLeft: 0 }).subject, 'ITP Logan is due today')
  })

  test('leaves out what says nothing', () => {
    const other = reminderDue('en', { ...REMINDER, kind: 'altele', subject: null })
    assert.ok(other.text.includes('ITP Logan is due on 1 December 2026'))
    assert.ok(reminderDue('en', { ...REMINDER, subject: null }).text.includes('ITP Logan (ITP) is due'))
  })

  test('escapes the reminder’s own text in the HTML', () => {
    const email = reminderDue('en', { ...REMINDER, name: '<b>ITP</b>' })
    assert.ok(email.html.includes('&lt;b&gt;ITP&lt;/b&gt;'))
    assert.ok(!email.html.includes('<b>ITP</b>'))
  })
})
