import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { appClient, createUser, EMAIL_ENV, signIn, TEST_PASSWORD } from '../../../test/auth.ts'
import { tempDatabase } from '../../../test/helpers.ts'
import { memoryMailer } from '../../email/mailer.ts'
import { issueToken } from '../auth/tokens.ts'

/* Which account changes end up in the history. */

const { db, dataDir } = tempDatabase()
await createUser(db, 'ana@example.com')

const NEW_PASSWORD = 'Alta-parola-buna-2'

const client = await appClient(db, dataDir, EMAIL_ENV, memoryMailer())
const anaId = (db.prepare("SELECT id FROM users WHERE email = 'ana@example.com'").get() as { id: string }).id

async function actions(cookie: string): Promise<string[]> {
  const res = await client.request('GET', '/api/activity', { headers: { cookie } })
  return ((await res.json()) as { action: string }[]).map((entry) => entry.action)
}

describe('the activity history records', () => {
  test('a new name', async () => {
    const ana = await signIn(client, 'ana@example.com')
    await client.request('PATCH', '/api/user/me', { body: { displayName: 'Ana Ionescu' }, headers: { cookie: ana } })
    assert.deepEqual(await actions(ana), ['account.renamed'])
  })

  test('a password change, and not a failed attempt', async () => {
    const ana = await signIn(client, 'ana@example.com')
    const change = (currentPassword: string) =>
      client.request('POST', '/api/auth/change-password', {
        body: { currentPassword, newPassword: NEW_PASSWORD },
        headers: { cookie: ana },
      })
    assert.equal((await change('Gresit-dar-lung-1')).status, 401)
    assert.deepEqual(await actions(ana), ['account.renamed'])
    assert.equal((await change(TEST_PASSWORD)).status, 200)
    assert.deepEqual(await actions(ana), ['account.password_changed', 'account.renamed'])
  })

  test('a password chosen with a reset link', async () => {
    const token = issueToken(db, anaId, 'password_reset')
    const res = await client.request('POST', '/api/auth/reset-password', { body: { token, password: TEST_PASSWORD } })
    assert.equal(res.status, 200)
    const ana = await signIn(client, 'ana@example.com')
    assert.equal((await actions(ana))[0], 'account.password_reset')
  })

  test('signing out everywhere', async () => {
    const ana = await signIn(client, 'ana@example.com')
    await client.request('POST', '/api/auth/logout-all', { headers: { cookie: ana } })
    const again = await signIn(client, 'ana@example.com')
    assert.equal((await actions(again))[0], 'account.logged_out_everywhere')
  })

  test('nothing for signing in or out', async () => {
    const before = await actions(await signIn(client, 'ana@example.com'))
    const ana = await signIn(client, 'ana@example.com')
    await client.request('POST', '/api/auth/logout', { headers: { cookie: ana } })
    assert.deepEqual(await actions(await signIn(client, 'ana@example.com')), before)
  })
})
