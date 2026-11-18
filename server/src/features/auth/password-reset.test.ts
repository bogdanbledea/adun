import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { appClient, createUser, EMAIL_ENV, sessionCookie, signIn, TEST_PASSWORD } from '../../../test/auth.ts'
import { tempDatabase } from '../../../test/helpers.ts'
import { memoryMailer } from '../../email/mailer.ts'
import { silentLogger } from '../../lib/log.ts'
import { register } from './service.ts'
import { issueToken } from './tokens.ts'

const { db, dataDir } = tempDatabase()

const NEW_PASSWORD = 'Alta-parola-buna-2'

const codeOf = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code
const tokenIn = (text: string) => /#token=([A-Za-z0-9_-]{43})/.exec(text)?.[1] ?? ''

function userRow(email: string) {
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email)
  assert.ok(row, `no user ${email}`)
  return row
}

const resetLink = (email: string) => issueToken(db, userRow(email).id as string, 'password_reset')

describe('with email on', async () => {
  const mailer = memoryMailer()
  const client = await appClient(db, dataDir, EMAIL_ENV, mailer)
  const reset = (token: string, password = NEW_PASSWORD) =>
    client.request('POST', '/api/auth/reset-password', { body: { token, password } })
  const login = (email: string, password: string) =>
    client.request('POST', '/api/auth/login', { body: { email, password } })
  const me = (cookie: string) => client.request('GET', '/api/user/me', { headers: { cookie } })

  test('the link from the email sets the new password and signs in', async () => {
    await createUser(db, 'ana@example.com')
    await client.request('POST', '/api/auth/forgot-password', { body: { email: 'ana@example.com' } })
    for (let i = 0; i < 50 && mailer.sent.length < 1; i++) await new Promise((resolve) => setTimeout(resolve, 10))
    const token = tokenIn(mailer.sent[0]?.text ?? '')

    const res = await reset(token)
    assert.equal(res.status, 200)
    const cookie = sessionCookie(res)
    const { user } = (await res.json()) as { user: { email: string } }
    assert.equal(user.email, 'ana@example.com')
    assert.equal((await me(cookie)).status, 200)

    assert.equal((await login('ana@example.com', TEST_PASSWORD)).status, 401)
    assert.equal((await login('ana@example.com', NEW_PASSWORD)).status, 200)
  })

  test('every session the account had is ended', async () => {
    await createUser(db, 'ion@example.com')
    const before = [await signIn(client, 'ion@example.com'), await signIn(client, 'ion@example.com')]
    const res = await reset(resetLink('ion@example.com'))
    for (const cookie of before) assert.equal((await me(cookie)).status, 401)
    assert.equal((await me(sessionCookie(res))).status, 200)
  })

  test('a link works once, and only the newest one', async () => {
    await createUser(db, 'sara@example.com')
    const older = resetLink('sara@example.com')
    const newer = resetLink('sara@example.com')
    assert.equal(await codeOf(await reset(older)), 'invalid_token')
    assert.equal((await reset(newer)).status, 200)
    const again = await reset(newer, 'Inca-o-parola-buna-3')
    assert.equal(again.status, 400)
    assert.equal(await codeOf(again), 'invalid_token')
    assert.equal((await login('sara@example.com', NEW_PASSWORD)).status, 200)
  })

  test('an expired, mangled or confirmation link is refused', async () => {
    await createUser(db, 'toma@example.com')
    const expired = resetLink('toma@example.com')
    db.prepare("UPDATE auth_tokens SET expires_at = '2000-01-01T00:00:00.000Z' WHERE purpose = 'password_reset'").run()
    const confirmation = issueToken(db, userRow('toma@example.com').id as string, 'email_verification')
    for (const token of [expired, 'not-a-token', confirmation]) {
      assert.equal(await codeOf(await reset(token)), 'invalid_token')
    }
    assert.equal((await login('toma@example.com', TEST_PASSWORD)).status, 200)
  })

  test('a weak password is refused and leaves the link working', async () => {
    await createUser(db, 'dan@example.com')
    const token = resetLink('dan@example.com')
    assert.equal(await codeOf(await reset(token, 'scurta')), 'weak_password')
    assert.equal((await reset(token)).status, 200)
  })

  test('a new password ends a lockout and confirms the address', async () => {
    await register(
      db,
      silentLogger,
      { email: 'radu@example.com', password: TEST_PASSWORD, displayName: 'Radu' },
      { verified: false },
    )
    db.prepare(
      "UPDATE users SET failed_login_count = 9, locked_until = '2999-01-01T00:00:00.000Z' WHERE email = 'radu@example.com'",
    ).run()
    assert.equal((await reset(resetLink('radu@example.com'))).status, 200)
    const row = userRow('radu@example.com')
    assert.equal(row.failed_login_count, 0)
    assert.equal(row.locked_until, null)
    assert.notEqual(row.email_verified_at, null)
    assert.equal((await login('radu@example.com', NEW_PASSWORD)).status, 200)
  })
})

test('with email off, choosing a new password says so', async () => {
  await createUser(db, 'vlad@example.com')
  const client = await appClient(db, dataDir)
  const res = await client.request('POST', '/api/auth/reset-password', {
    body: { token: resetLink('vlad@example.com'), password: NEW_PASSWORD },
  })
  assert.equal(res.status, 403)
  assert.equal(await codeOf(res), 'email_disabled')
})
