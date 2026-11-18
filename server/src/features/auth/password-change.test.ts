import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { appClient, createUser, EMAIL_ENV, signIn, TEST_PASSWORD } from '../../../test/auth.ts'
import { tempDatabase } from '../../../test/helpers.ts'
import { memoryMailer } from '../../email/mailer.ts'
import { issueToken } from './tokens.ts'

const { db, dataDir } = tempDatabase()
await createUser(db, 'ana@example.com')
await createUser(db, 'ion@example.com', 'Ion Ionescu')

const NEW_PASSWORD = 'Alta-parola-buna-2'

const client = await appClient(db, dataDir)
const change = (cookie: string | null, body: unknown) =>
  client.request('POST', '/api/auth/change-password', { body, headers: cookie ? { cookie } : {} })
const login = (email: string, password: string) =>
  client.request('POST', '/api/auth/login', { body: { email, password } })
const me = (cookie: string) => client.request('GET', '/api/user/me', { headers: { cookie } })
const codeOf = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code

function userRow(email: string) {
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email)
  assert.ok(row, `no user ${email}`)
  return row
}

describe('POST /api/auth/change-password', () => {
  test('refuses a wrong current password, which counts towards the lockout', async () => {
    const ana = await signIn(client, 'ana@example.com')
    const res = await change(ana, { currentPassword: 'Gresit-dar-lung-1', newPassword: NEW_PASSWORD })
    assert.equal(res.status, 401)
    assert.equal(await codeOf(res), 'wrong_password')
    assert.equal(userRow('ana@example.com').failed_login_count, 1)
    // Still signed in, with the old password.
    assert.equal((await me(ana)).status, 200)
    assert.equal((await login('ana@example.com', TEST_PASSWORD)).status, 200)
  })

  test('refuses a weak new password before checking the current one', async () => {
    const ana = await signIn(client, 'ana@example.com')
    const res = await change(ana, { currentPassword: 'Gresit-dar-lung-1', newPassword: 'scurta' })
    assert.equal(res.status, 400)
    assert.equal(await codeOf(res), 'weak_password')
    assert.equal(userRow('ana@example.com').failed_login_count, 0)
  })

  test('refuses a body without both passwords', async () => {
    const ana = await signIn(client, 'ana@example.com')
    for (const body of [{}, { newPassword: NEW_PASSWORD }, { currentPassword: '', newPassword: NEW_PASSWORD }]) {
      const res = await change(ana, body)
      assert.equal(res.status, 400, JSON.stringify(body))
      assert.equal(await codeOf(res), 'invalid_input')
    }
  })

  test('sets the new password, keeps this session and ends the others', async () => {
    const here = await signIn(client, 'ana@example.com')
    const elsewhere = await signIn(client, 'ana@example.com')
    const ion = await signIn(client, 'ion@example.com')
    const resetLink = issueToken(db, userRow('ana@example.com').id as string, 'password_reset')
    assert.ok(resetLink)

    const res = await change(here, { currentPassword: TEST_PASSWORD, newPassword: NEW_PASSWORD })
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), { ok: true })

    assert.equal((await me(here)).status, 200)
    assert.equal((await me(elsewhere)).status, 401)
    assert.equal((await me(ion)).status, 200, 'another account is not touched')
    assert.equal((await login('ana@example.com', TEST_PASSWORD)).status, 401)
    assert.equal((await login('ana@example.com', NEW_PASSWORD)).status, 200)
    // An unused reset link no longer works.
    const links = db.prepare("SELECT count(*) AS n FROM auth_tokens WHERE purpose = 'password_reset'").get()
    assert.equal(links?.n, 0)
  })

  test('needs a session', async () => {
    const res = await change(null, { currentPassword: NEW_PASSWORD, newPassword: TEST_PASSWORD })
    assert.equal(res.status, 401)
    assert.equal(await codeOf(res), 'unauthorized')
  })
})

describe('with email on', async () => {
  const mailer = memoryMailer()
  const emailClient = await appClient(db, dataDir, EMAIL_ENV, mailer)

  test('tells the owner, in their language, with a link to ask for a new password', async () => {
    const ion = await signIn(emailClient, 'ion@example.com')
    const res = await emailClient.request('POST', '/api/auth/change-password', {
      body: { currentPassword: TEST_PASSWORD, newPassword: NEW_PASSWORD, language: 'en' },
      headers: { cookie: ion },
    })
    assert.equal(res.status, 200)
    for (let i = 0; i < 50 && mailer.sent.length < 1; i++) await new Promise((resolve) => setTimeout(resolve, 10))

    const email = mailer.sent[0]
    assert.ok(email)
    assert.equal(email.kind, 'password_changed')
    assert.equal(email.to, 'ion@example.com')
    assert.equal(email.subject, 'Your adun password was changed')
    assert.ok(email.text.includes('http://app.test/parola-uitata'))
  })

  test('sends nothing when the current password is wrong', async () => {
    const before = mailer.sent.length
    const ion = await signIn(emailClient, 'ion@example.com', NEW_PASSWORD)
    const res = await emailClient.request('POST', '/api/auth/change-password', {
      body: { currentPassword: TEST_PASSWORD, newPassword: 'Inca-una-buna-3' },
      headers: { cookie: ion },
    })
    assert.equal(res.status, 401)
    await new Promise((resolve) => setTimeout(resolve, 50))
    assert.equal(mailer.sent.length, before)
  })
})
