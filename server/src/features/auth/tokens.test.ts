import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { describe, test } from 'node:test'
import { createUser } from '../../../test/auth.ts'
import { tempDatabase } from '../../../test/helpers.ts'
import { consumeToken, issueToken, peekToken } from './tokens.ts'

const { db } = tempDatabase()
await createUser(db, 'ana@example.com')
const userId = db.prepare("SELECT id FROM users WHERE email = 'ana@example.com'").get()?.id as string

const HOUR = 60 * 60 * 1000
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')
const row = (token: string) => db.prepare('SELECT * FROM auth_tokens WHERE token_hash = ?').get(sha256(token))

describe('email link tokens', () => {
  test('only the hash is stored, with the lifetime of its purpose', () => {
    const token = issueToken(db, userId, 'email_verification')
    assert.match(token, /^[A-Za-z0-9_-]{43}$/)
    assert.equal(db.prepare('SELECT 1 FROM auth_tokens WHERE token_hash = ?').get(token), undefined)
    const lifetime = Date.parse(row(token)?.expires_at as string) - Date.now()
    assert.ok(lifetime > 23.9 * HOUR && lifetime <= 24 * HOUR)

    const reset = issueToken(db, userId, 'password_reset')
    const resetLifetime = Date.parse(row(reset)?.expires_at as string) - Date.now()
    assert.ok(resetLifetime > 0.9 * HOUR && resetLifetime <= HOUR)
  })

  test('works once', () => {
    const token = issueToken(db, userId, 'email_verification')
    assert.equal(consumeToken(db, token, 'email_verification')?.userId, userId)
    assert.equal(consumeToken(db, token, 'email_verification'), null)
    assert.equal(peekToken(db, token, 'email_verification'), null)
  })

  test('peeking does not use it up', () => {
    const token = issueToken(db, userId, 'email_verification', 'b'.repeat(64))
    assert.deepEqual(peekToken(db, token, 'email_verification'), { userId, browserHash: 'b'.repeat(64) })
    assert.equal(consumeToken(db, token, 'email_verification')?.userId, userId)
  })

  test('only for its purpose', () => {
    const token = issueToken(db, userId, 'password_reset')
    assert.equal(consumeToken(db, token, 'email_verification'), null)
    assert.equal(consumeToken(db, token, 'password_reset')?.userId, userId)
  })

  test('a newer link replaces the older one', () => {
    const older = issueToken(db, userId, 'email_verification')
    const newer = issueToken(db, userId, 'email_verification')
    assert.equal(consumeToken(db, older, 'email_verification'), null)
    assert.equal(consumeToken(db, newer, 'email_verification')?.userId, userId)
  })

  test('not once expired, and never for something that is not a token', () => {
    const token = issueToken(db, userId, 'email_verification')
    db.prepare('UPDATE auth_tokens SET expires_at = ? WHERE token_hash = ?').run(
      new Date(Date.now() - 1000).toISOString(),
      sha256(token),
    )
    assert.equal(consumeToken(db, token, 'email_verification'), null)
    assert.equal(consumeToken(db, "x' OR 1=1 --", 'email_verification'), null)
    assert.equal(consumeToken(db, '', 'email_verification'), null)
  })
})
