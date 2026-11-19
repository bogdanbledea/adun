import assert from 'node:assert/strict'
import { test } from 'node:test'
import { appClient, createUser, EMAIL_ENV, sessionCookie, signIn, TEST_PASSWORD } from '../../../test/auth.ts'
import { captureLogger, tempDatabase } from '../../../test/helpers.ts'
import { memoryMailer } from '../../email/mailer.ts'
import { generatePassword, resetPasswordByAdmin } from './admin-reset.ts'
import { passwordProblem } from './password.ts'
import { register } from './service.ts'
import { issueToken } from './tokens.ts'

const { db, dataDir } = tempDatabase()
const { log, lines } = captureLogger()
await createUser(db, 'ana@example.com')
const client = await appClient(db, dataDir, EMAIL_ENV, memoryMailer())

const userId = (email: string) => (db.prepare('SELECT id FROM users WHERE email = ?').get(email) as { id: string }).id
const login = (email: string, password: string) =>
  client.request('POST', '/api/auth/login', { body: { email, password } })
const me = (cookie: string) => client.request('GET', '/api/user/me', { headers: { cookie } })

test('a generated password is four groups of five characters that meets the rules', () => {
  for (let i = 0; i < 50; i++) {
    const password = generatePassword()
    assert.match(password, /^[\w-]{5}-[\w-]{5}-[\w-]{5}-[\w-]{5}$/)
    assert.equal(passwordProblem(password), null)
  }
})

test('the new password signs in, the old one no longer does, and every session ends', async () => {
  const before = await signIn(client, 'ana@example.com')
  const reset = await resetPasswordByAdmin(db, log, 'Ana@Example.com ')
  assert.ok(reset)
  assert.equal(reset.email, 'ana@example.com')

  assert.equal((await me(before)).status, 401)
  assert.equal((await login('ana@example.com', TEST_PASSWORD)).status, 401)
  const after = await login('ana@example.com', reset.password)
  assert.equal(after.status, 200)

  const res = await client.request('GET', '/api/activity', { headers: { cookie: sessionCookie(after) } })
  const [latest] = (await res.json()) as { action: string }[]
  assert.equal(latest?.action, 'account.password_reset_by_admin')
  const line = lines.find((entry) => entry.msg === 'auth.password_reset_by_admin')
  assert.ok(line)
  assert.ok(!JSON.stringify(line).includes('ana@example.com'), 'no address in the log')
})

test('it ends a lockout', async () => {
  db.prepare('UPDATE users SET failed_login_count = 9, locked_until = ? WHERE email = ?').run(
    new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    'ana@example.com',
  )
  const reset = await resetPasswordByAdmin(db, log, 'ana@example.com')
  assert.equal((await login('ana@example.com', reset?.password ?? '')).status, 200)
})

test('it confirms an address that was never confirmed', async () => {
  await register(
    db,
    log,
    { email: 'ion@example.com', password: TEST_PASSWORD, displayName: 'Ion', language: 'ro' },
    { verified: false },
  )
  assert.equal((await login('ion@example.com', TEST_PASSWORD)).status, 403)
  const reset = await resetPasswordByAdmin(db, log, 'ion@example.com')
  assert.equal((await login('ion@example.com', reset?.password ?? '')).status, 200)
})

test('a reset link sent earlier stops working', async () => {
  const token = issueToken(db, userId('ana@example.com'), 'password_reset')
  await resetPasswordByAdmin(db, log, 'ana@example.com')
  const res = await client.request('POST', '/api/auth/reset-password', { body: { token, password: TEST_PASSWORD } })
  assert.equal(res.status, 400)
})

test('an unknown address changes nothing', async () => {
  const hashes = () => db.prepare('SELECT password_hash FROM users ORDER BY email').all()
  const before = hashes()
  assert.equal(await resetPasswordByAdmin(db, log, 'nobody@example.com'), null)
  assert.deepEqual(hashes(), before)
})
