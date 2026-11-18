import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { appClient, createUser, signIn, TEST_PASSWORD } from '../../../test/auth.ts'
import { tempDatabase } from '../../../test/helpers.ts'
import { issueToken } from '../auth/tokens.ts'

const { db, dataDir } = tempDatabase()
await createUser(db, 'ana@example.com')
await createUser(db, 'ion@example.com', 'Ion Ionescu')

const client = await appClient(db, dataDir)
const remove = (cookie: string | null) =>
  client.request('DELETE', '/api/user', { headers: cookie ? { cookie } : {} })
const confirm = (cookie: string) =>
  client.request('POST', '/api/auth/confirm-password', { body: { password: TEST_PASSWORD }, headers: { cookie } })
const me = (cookie: string) => client.request('GET', '/api/user/me', { headers: { cookie } })
const codeOf = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code

const idOf = (email: string) => db.prepare('SELECT id FROM users WHERE email = ?').get(email)?.id as string | undefined
const rowsOf = (table: string, userId: string) =>
  db.prepare(`SELECT count(*) AS n FROM ${table} WHERE user_id = ?`).get(userId)?.n

describe('DELETE /api/user', () => {
  test('needs the password confirmed first', async () => {
    const ana = await signIn(client, 'ana@example.com')
    const res = await remove(ana)
    assert.equal(res.status, 403)
    assert.equal(await codeOf(res), 'password_confirmation_required')
    assert.ok(idOf('ana@example.com'))
  })

  test('a confirmation on another session does not count', async () => {
    const ana = await signIn(client, 'ana@example.com')
    const elsewhere = await signIn(client, 'ana@example.com')
    await confirm(elsewhere)
    assert.equal((await remove(ana)).status, 403)
    assert.ok(idOf('ana@example.com'))
  })

  test('deletes the account with its sessions and links, and signs out', async () => {
    const ana = await signIn(client, 'ana@example.com')
    const elsewhere = await signIn(client, 'ana@example.com')
    const ion = await signIn(client, 'ion@example.com')
    const anaId = idOf('ana@example.com') ?? ''
    issueToken(db, anaId, 'password_reset')
    db.prepare("INSERT INTO auth_emails (user_id, kind, sent_at) VALUES (?, 'reset', ?)").run(anaId, new Date().toISOString())

    await confirm(ana)
    const res = await remove(ana)
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), { ok: true })
    assert.match(res.headers.get('set-cookie') ?? '', /^adun_session=;.*Expires=Thu, 01 Jan 1970/)

    assert.equal(idOf('ana@example.com'), undefined)
    for (const table of ['sessions', 'auth_tokens', 'auth_emails']) assert.equal(rowsOf(table, anaId), 0, table)
    assert.equal((await me(ana)).status, 401)
    assert.equal((await me(elsewhere)).status, 401)
    const login = await client.request('POST', '/api/auth/login', {
      body: { email: 'ana@example.com', password: TEST_PASSWORD },
    })
    assert.equal(await codeOf(login), 'invalid_credentials')

    // Another account is not touched.
    assert.equal((await me(ion)).status, 200)
  })

  test('needs a session', async () => {
    assert.equal(await codeOf(await remove(null)), 'unauthorized')
  })

  test('is refused from another site', async () => {
    const ion = await signIn(client, 'ion@example.com')
    await confirm(ion)
    const res = await client.request('DELETE', '/api/user', { headers: { cookie: ion, 'sec-fetch-site': 'cross-site' } })
    assert.equal(res.status, 403)
    assert.ok(idOf('ion@example.com'))
  })
})
