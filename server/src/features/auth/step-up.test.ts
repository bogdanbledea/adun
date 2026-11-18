import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { describe, test } from 'node:test'
import { appClient, createUser, signIn, TEST_PASSWORD } from '../../../test/auth.ts'
import { tempDatabase } from '../../../test/helpers.ts'
import { claimRecentPassword } from './step-up.ts'

const { db, dataDir } = tempDatabase()
await createUser(db, 'ana@example.com')

const MINUTE = 60 * 1000

const client = await appClient(db, dataDir)
const confirm = (cookie: string | null, body: unknown) =>
  client.request('POST', '/api/auth/confirm-password', { body, headers: cookie ? { cookie } : {} })
const codeOf = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')
function sessionOf(cookie: string): { id: string; confirmedAt: string | null } {
  const token = cookie.slice(cookie.indexOf('=') + 1)
  const row = db.prepare('SELECT id, password_confirmed_at FROM sessions WHERE token_hash = ?').get(sha256(token))
  assert.ok(row, 'no session row')
  return { id: row.id as string, confirmedAt: row.password_confirmed_at as string | null }
}
const failures = () => db.prepare("SELECT failed_login_count FROM users WHERE email = 'ana@example.com'").get()?.failed_login_count

describe('POST /api/auth/confirm-password', () => {
  test('marks this session, and no other, when the password is right', async () => {
    const here = await signIn(client, 'ana@example.com')
    const elsewhere = await signIn(client, 'ana@example.com')
    const res = await confirm(here, { password: TEST_PASSWORD })
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), { ok: true })
    assert.ok(sessionOf(here).confirmedAt)
    assert.equal(sessionOf(elsewhere).confirmedAt, null)
  })

  test('refuses a wrong password, which counts towards the lockout', async () => {
    const cookie = await signIn(client, 'ana@example.com')
    const res = await confirm(cookie, { password: 'Gresit-dar-lung-1' })
    assert.equal(res.status, 401)
    assert.equal(await codeOf(res), 'wrong_password')
    assert.equal(sessionOf(cookie).confirmedAt, null)
    assert.equal(failures(), 1)
  })

  test('refuses a missing password', async () => {
    const cookie = await signIn(client, 'ana@example.com')
    assert.equal(await codeOf(await confirm(cookie, {})), 'invalid_input')
  })

  test('needs a session', async () => {
    assert.equal(await codeOf(await confirm(null, { password: TEST_PASSWORD })), 'unauthorized')
  })
})

describe('claimRecentPassword', () => {
  const confirmedAgo = (cookie: string, ms: number) => {
    db.prepare('UPDATE sessions SET password_confirmed_at = ? WHERE id = ?').run(
      new Date(Date.now() - ms).toISOString(),
      sessionOf(cookie).id,
    )
  }

  test('signing in alone is not enough', async () => {
    const cookie = await signIn(client, 'ana@example.com')
    assert.equal(claimRecentPassword(db, sessionOf(cookie).id), false)
  })

  test('allows one action within five minutes of confirming', async () => {
    const cookie = await signIn(client, 'ana@example.com')
    await confirm(cookie, { password: TEST_PASSWORD })
    assert.equal(claimRecentPassword(db, sessionOf(cookie).id), true)
    assert.equal(claimRecentPassword(db, sessionOf(cookie).id), false, 'used up')
  })

  test('refuses a confirmation older than five minutes', async () => {
    const cookie = await signIn(client, 'ana@example.com')
    confirmedAgo(cookie, 4 * MINUTE)
    assert.equal(claimRecentPassword(db, sessionOf(cookie).id), true)
    confirmedAgo(cookie, 6 * MINUTE)
    assert.equal(claimRecentPassword(db, sessionOf(cookie).id), false)
  })

  test('refuses a session that has ended since', async () => {
    const cookie = await signIn(client, 'ana@example.com')
    await confirm(cookie, { password: TEST_PASSWORD })
    await client.request('POST', '/api/auth/logout', { headers: { cookie } })
    assert.equal(claimRecentPassword(db, sessionOf(cookie).id), false)
  })
})
