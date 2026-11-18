import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { appClient, createUser, EMAIL_ENV, TEST_PASSWORD } from '../../../test/auth.ts'
import { tempDatabase } from '../../../test/helpers.ts'
import { memoryMailer } from '../../email/mailer.ts'
import { silentLogger } from '../../lib/log.ts'
import { register } from './service.ts'

const { db, dataDir } = tempDatabase()

const codeOf = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code
const settle = () => new Promise((resolve) => setTimeout(resolve, 50))
const tokenIn = (text: string) => /#token=([A-Za-z0-9_-]{43})/.exec(text)?.[1] ?? ''

// Moves this account's past sends back in time, as if minutes had passed.
const later = (email: string, minutes: number) =>
  db
    .prepare(
      `UPDATE auth_emails SET sent_at = strftime('%Y-%m-%dT%H:%M:%fZ', sent_at, ?)
       WHERE user_id = (SELECT id FROM users WHERE email = ?)`,
    )
    .run(`-${String(minutes)} minutes`, email)

const resetExpiry = (email: string) =>
  db
    .prepare(
      `SELECT expires_at FROM auth_tokens
       WHERE purpose = 'password_reset' AND user_id = (SELECT id FROM users WHERE email = ?)`,
    )
    .get(email)?.expires_at as string | undefined

describe('with email on', async () => {
  const mailer = memoryMailer()
  const client = await appClient(db, dataDir, EMAIL_ENV, mailer)
  const forgot = (email: string, language = 'ro') =>
    client.request('POST', '/api/auth/forgot-password', { body: { email, language } })

  /** The emails are sent after the answer; wait for the next one. */
  async function nextEmail(count: number) {
    for (let i = 0; i < 50 && mailer.sent.length < count; i++) await new Promise((resolve) => setTimeout(resolve, 10))
    const email = mailer.sent[count - 1]
    assert.ok(email, 'no email was sent')
    return email
  }

  await createUser(db, 'ana@example.com')

  test('every address gets the same answer; only an account gets an email', async () => {
    const before = mailer.sent.length
    for (const email of ['nobody@example.com', 'ana@example.com']) {
      const res = await forgot(email)
      assert.equal(res.status, 200)
      assert.deepEqual(await res.json(), { ok: true })
      assert.equal(res.headers.get('set-cookie'), null)
    }
    const sent = await nextEmail(before + 1)
    await settle()
    assert.equal(mailer.sent.length, before + 1)
    assert.equal(sent.kind, 'password_reset')
    assert.equal(sent.to, 'ana@example.com')
    assert.equal(sent.subject, 'Parolă nouă pentru adun')
    assert.match(sent.text, /http:\/\/app\.test\/parola-noua#token=[A-Za-z0-9_-]{43}/)
  })

  test('the email is in the language asked for, and only the newest link is kept', async () => {
    later('ana@example.com', 2)
    const before = mailer.sent.length
    await forgot('ana@example.com', 'en')
    const sent = await nextEmail(before + 1)
    assert.equal(sent.subject, 'A new password for adun')
    const count = db
      .prepare(
        `SELECT count(*) AS n FROM auth_tokens
         WHERE purpose = 'password_reset' AND user_id = (SELECT id FROM users WHERE email = 'ana@example.com')`,
      )
      .get()?.n
    assert.equal(count, 1)
    assert.ok(tokenIn(sent.text))
  })

  test('an account that is not confirmed yet gets the email too', async () => {
    await register(
      db,
      silentLogger,
      { email: 'ion@example.com', password: TEST_PASSWORD, displayName: 'Ion', language: 'ro' },
      { verified: false },
    )
    const before = mailer.sent.length
    await forgot('ion@example.com')
    assert.equal((await nextEmail(before + 1)).to, 'ion@example.com')
  })

  test('at most one a minute', async () => {
    await createUser(db, 'sara@example.com')
    const first = mailer.sent.length
    await forgot('sara@example.com')
    await nextEmail(first + 1)
    const before = mailer.sent.length
    await forgot('sara@example.com')
    await settle()
    assert.equal(mailer.sent.length, before)
  })

  test('past five a day, no email: the newest link works for another hour instead', async () => {
    await createUser(db, 'toma@example.com')
    for (let i = 1; i <= 5; i++) {
      later('toma@example.com', 2)
      const before = mailer.sent.length
      await forgot('toma@example.com')
      await nextEmail(before + 1)
    }
    // As if the newest link were about to expire.
    db.prepare(
      `UPDATE auth_tokens SET expires_at = ?
       WHERE user_id = (SELECT id FROM users WHERE email = 'toma@example.com')`,
    ).run(new Date(Date.now() + 60 * 1000).toISOString())
    later('toma@example.com', 2)
    const before = mailer.sent.length
    await forgot('toma@example.com')
    await settle()
    assert.equal(mailer.sent.length, before, 'no sixth email')
    const expiresIn = Date.parse(resetExpiry('toma@example.com') ?? '') - Date.now()
    assert.ok(expiresIn > 59 * 60 * 1000, 'the newest link was given a full hour again')
  })

  test('asking for a new password leaves the confirmation emails their own share', async () => {
    await register(
      db,
      silentLogger,
      { email: 'radu@example.com', password: TEST_PASSWORD, displayName: 'Radu', language: 'ro' },
      { verified: false },
    )
    for (let i = 1; i <= 5; i++) {
      later('radu@example.com', 2)
      await forgot('radu@example.com')
      await settle()
    }
    later('radu@example.com', 2)
    const before = mailer.sent.length
    await client.request('POST', '/api/auth/resend-verification', { body: { email: 'radu@example.com' } })
    assert.equal((await nextEmail(before + 1)).kind, 'verify_email')
  })
})

test('with email off, asking for a new password says so, the same for every address', async () => {
  await createUser(db, 'dan@example.com')
  const client = await appClient(db, dataDir)
  for (const email of ['nobody@example.com', 'dan@example.com']) {
    const res = await client.request('POST', '/api/auth/forgot-password', { body: { email } })
    assert.equal(res.status, 403)
    assert.equal(await codeOf(res), 'email_disabled')
  }
})
