import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { describe, mock, test } from 'node:test'
import { appClient, createUser, sessionCookie, signIn, TEST_PASSWORD } from '../../../test/auth.ts'
import { tempDatabase } from '../../../test/helpers.ts'
import { passwords } from './password.ts'

const { db, dataDir } = tempDatabase()
await createUser(db, 'ana@example.com')
await createUser(db, 'ion@example.com', 'Ion Ionescu')

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')
const liveSessions = (email: string) =>
  db
    .prepare(
      `SELECT count(*) AS n FROM sessions
       WHERE user_id = (SELECT id FROM users WHERE email = ?) AND revoked_at IS NULL`,
    )
    .get(email)?.n
const tokenOf = (cookie: string) => cookie.slice(cookie.indexOf('=') + 1)
const ago = (ms: number) => new Date(Date.now() - ms).toISOString()

function sessionRow(cookie: string) {
  const row = db.prepare('SELECT * FROM sessions WHERE token_hash = ?').get(sha256(tokenOf(cookie)))
  assert.ok(row, 'no session row')
  return row
}

const client = await appClient(db, dataDir)
const login = (email: string, password: string) =>
  client.request('POST', '/api/auth/login', { body: { email, password } })
const me = (cookie?: string) => client.request('GET', '/api/user/me', { headers: cookie ? { cookie } : {} })

describe('POST /api/auth/login', () => {
  test('answers with the user and sets an HttpOnly, SameSite=Lax session cookie', async () => {
    const res = await login(' ANA@example.com ', TEST_PASSWORD)
    assert.equal(res.status, 200)
    const user = (await res.json()) as Record<string, unknown>
    assert.equal(user.email, 'ana@example.com')
    assert.equal(user.displayName, 'Ana Popescu')
    assert.equal('passwordHash' in user, false)

    const header = res.headers.get('set-cookie') ?? ''
    assert.match(header, /^adun_session=[A-Za-z0-9_-]{43};/)
    assert.match(header, /Max-Age=2592000/)
    assert.match(header, /Path=\//)
    assert.match(header, /HttpOnly/)
    assert.match(header, /SameSite=Lax/)
    assert.doesNotMatch(header, /Secure/)
  })

  test('over https the cookie is __Host- prefixed and Secure', async () => {
    const https = await appClient(db, dataDir, { APP_URL: 'https://adun.example.com' })
    const res = await https.request('POST', '/api/auth/login', {
      body: { email: 'ana@example.com', password: TEST_PASSWORD },
    })
    const header = res.headers.get('set-cookie') ?? ''
    assert.match(header, /^__Host-adun_session=/)
    assert.match(header, /Secure/)
  })

  test('stores only the hash of the cookie value', async () => {
    const cookie = await signIn(client, 'ana@example.com')
    const token = tokenOf(cookie)
    assert.equal(sessionRow(cookie).token_hash, sha256(token))
    assert.equal(db.prepare('SELECT 1 FROM sessions WHERE token_hash = ?').get(token), undefined)
  })

  test('keeps at most 10 live sessions: the 11th sign-in revokes the oldest', async () => {
    db.prepare("UPDATE sessions SET revoked_at = ? WHERE revoked_at IS NULL").run(ago(0))
    const cookies: string[] = []
    for (let i = 0; i < 11; i++) cookies.push(await signIn(client, 'ana@example.com'))
    assert.equal((await me(cookies[0])).status, 401)
    for (const cookie of cookies.slice(1)) assert.equal((await me(cookie)).status, 200)
    assert.equal(liveSessions('ana@example.com'), 10)
  })

  test('an unknown address and a wrong password get the same answer, at the same cost', async (t) => {
    const verify = mock.method(passwords, 'verify')
    t.after(() => { verify.mock.restore() })

    const unknown = await login('nobody@example.com', TEST_PASSWORD)
    const wrong = await login('ana@example.com', 'Gresit-cal-baterie-1')
    for (const res of [unknown, wrong]) {
      assert.equal(res.status, 401)
      assert.deepEqual(await res.json(), { error: { code: 'invalid_credentials', message: 'Wrong email or password.' } })
      assert.equal(res.headers.get('set-cookie'), null)
    }
    assert.equal(verify.mock.callCount(), 2)
  })
})

describe('GET /api/user/me', () => {
  test('answers with the signed-in user', async () => {
    const res = await me(await signIn(client, 'ana@example.com'))
    assert.equal(res.status, 200)
    assert.equal(((await res.json()) as { email: string }).email, 'ana@example.com')
  })

  test('without a session it is a 401, and no cookie is set', async () => {
    const res = await me()
    assert.equal(res.status, 401)
    assert.deepEqual(await res.json(), { error: { code: 'unauthorized', message: 'Sign in to continue.' } })
    assert.equal(res.headers.get('set-cookie'), null)
  })

  test('a forged, expired or revoked session is a 401 that clears the cookie', async () => {
    const expired = await signIn(client, 'ana@example.com')
    db.prepare('UPDATE sessions SET expires_at = ? WHERE id = ?').run(ago(1000), sessionRow(expired).id as string)
    const revoked = await signIn(client, 'ana@example.com')
    db.prepare('UPDATE sessions SET revoked_at = ? WHERE id = ?').run(ago(1000), sessionRow(revoked).id as string)
    const forged = `adun_session=${'A'.repeat(43)}`

    for (const cookie of [forged, expired, revoked]) {
      const res = await me(cookie)
      assert.equal(res.status, 401)
      assert.match(res.headers.get('set-cookie') ?? '', /^adun_session=;.*Expires=Thu, 01 Jan 1970/)
    }
  })

  test('a session used after an hour moves its expiry and resends the cookie', async () => {
    const cookie = await signIn(client, 'ana@example.com')
    const id = sessionRow(cookie).id as string

    const soon = await me(cookie)
    assert.equal(soon.headers.get('set-cookie'), null, 'not renewed within the hour')

    db.prepare('UPDATE sessions SET last_used_at = ?, expires_at = ? WHERE id = ?').run(ago(2 * HOUR), ago(-DAY), id)
    const later = await me(cookie)
    assert.equal(later.status, 200)
    assert.equal(sessionCookie(later), cookie)
    const expiresIn = Date.parse(String(sessionRow(cookie).expires_at)) - Date.now()
    assert.ok(expiresIn > 29 * DAY, 'the expiry is 30 days from now again')
  })
})

describe('POST /api/auth/logout', () => {
  test('revokes the session and clears the cookie', async () => {
    const cookie = await signIn(client, 'ana@example.com')
    const res = await client.request('POST', '/api/auth/logout', { headers: { cookie } })
    assert.equal(res.status, 200)
    assert.match(res.headers.get('set-cookie') ?? '', /^adun_session=;/)
    assert.ok(sessionRow(cookie).revoked_at)
    assert.equal((await me(cookie)).status, 401)
  })

  test('works without a session too', async () => {
    const res = await client.request('POST', '/api/auth/logout')
    assert.equal(res.status, 200)
    assert.match(res.headers.get('set-cookie') ?? '', /^adun_session=;/)
  })
})

describe('POST /api/auth/logout-all', () => {
  test('ends every session of this account and no other', async () => {
    const here = await signIn(client, 'ana@example.com')
    const there = await signIn(client, 'ana@example.com')
    const someoneElse = await signIn(client, 'ion@example.com')

    const res = await client.request('POST', '/api/auth/logout-all', { headers: { cookie: here } })
    assert.equal(res.status, 200)
    assert.match(res.headers.get('set-cookie') ?? '', /^adun_session=;/)
    assert.equal((await me(here)).status, 401)
    assert.equal((await me(there)).status, 401)
    assert.equal(liveSessions('ana@example.com'), 0)
    assert.equal((await me(someoneElse)).status, 200)
  })

  test('needs a session', async () => {
    const res = await client.request('POST', '/api/auth/logout-all')
    assert.equal(res.status, 401)
  })
})
