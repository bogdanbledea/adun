import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { appClient, createUser, signIn, TEST_PASSWORD } from '../../../test/auth.ts'
import { tempDatabase } from '../../../test/helpers.ts'

const { db, dataDir } = tempDatabase()
await createUser(db, 'ana@example.com')
await createUser(db, 'ion@example.com', 'Ion Ionescu')

const client = await appClient(db, dataDir)
const ana = await signIn(client, 'ana@example.com')
const ion = await signIn(client, 'ion@example.com')

const update = (body: unknown, headers: Record<string, string | null> = { cookie: ana }) =>
  client.request('PATCH', '/api/user/me', { body, headers })
const nameOf = (email: string) => db.prepare('SELECT display_name FROM users WHERE email = ?').get(email)?.display_name

describe('PATCH /api/user/me', () => {
  test('changes the name and answers with the account', async () => {
    const res = await update({ displayName: 'Ana Ionescu' })
    assert.equal(res.status, 200)
    const user = (await res.json()) as Record<string, unknown>
    assert.deepEqual(Object.keys(user).sort(), ['createdAt', 'displayName', 'email', 'id'])
    assert.equal(user.displayName, 'Ana Ionescu')
    assert.equal(nameOf('ana@example.com'), 'Ana Ionescu')
  })

  test('trims the spaces around the name', async () => {
    await update({ displayName: '  Ana  ' })
    assert.equal(nameOf('ana@example.com'), 'Ana')
  })

  test('refuses a missing, empty, blank, too long or non-text name', async () => {
    for (const body of [{}, { displayName: '' }, { displayName: '   ' }, { displayName: 'a'.repeat(257) }, { displayName: 7 }]) {
      const res = await update(body)
      assert.equal(res.status, 400, JSON.stringify(body))
      assert.equal(((await res.json()) as { error: { code: string } }).error.code, 'invalid_input')
    }
    assert.equal(nameOf('ana@example.com'), 'Ana')
  })

  test('does not change the email address', async () => {
    const res = await update({ displayName: 'Ana', email: 'other@example.com' })
    assert.equal(res.status, 200)
    assert.equal(((await res.json()) as { email: string }).email, 'ana@example.com')
  })

  test('changes only the caller’s account', async () => {
    await update({ displayName: 'Ana Popescu' }, { cookie: ion })
    assert.equal(nameOf('ion@example.com'), 'Ana Popescu')
    assert.equal(nameOf('ana@example.com'), 'Ana')
  })

  test('needs a session', async () => {
    assert.equal((await update({ displayName: 'Nobody' }, {})).status, 401)
  })

  test('is refused from another site', async () => {
    const res = await update({ displayName: 'Mallory' }, { cookie: ana, 'sec-fetch-site': 'cross-site' })
    assert.equal(res.status, 403)
    assert.equal(nameOf('ana@example.com'), 'Ana')
  })
})

describe('the account’s language', () => {
  const languageOf = (email: string) => db.prepare('SELECT language FROM users WHERE email = ?').get(email)?.language
  const login = (body: Record<string, unknown>) =>
    client.request('POST', '/api/auth/login', { body: { password: TEST_PASSWORD, ...body } })

  test('is the one the account was registered in', async () => {
    const register = (email: string, language?: string) =>
      client.request('POST', '/api/auth/register', {
        body: { email, password: TEST_PASSWORD, displayName: 'Dan', language },
      })
    await register('dan@example.com', 'en')
    await register('radu@example.com')
    assert.equal(languageOf('dan@example.com'), 'en')
    assert.equal(languageOf('radu@example.com'), 'ro')
  })

  test('follows the language signed in with, and stays when none is sent', async () => {
    assert.equal((await login({ email: 'ion@example.com', language: 'en' })).status, 200)
    assert.equal(languageOf('ion@example.com'), 'en')
    await login({ email: 'ion@example.com' })
    assert.equal(languageOf('ion@example.com'), 'en')
    assert.equal((await login({ email: 'ion@example.com', language: 'de' })).status, 400)
  })

  test('changes on its own, leaving the name and the history alone', async () => {
    const res = await update({ language: 'en' })
    assert.equal(res.status, 200)
    assert.equal(((await res.json()) as { displayName: string }).displayName, 'Ana')
    assert.equal(languageOf('ana@example.com'), 'en')
    const renames = db.prepare("SELECT count(*) AS n FROM activity_logs WHERE action = 'account.renamed'").get()?.n
    await update({ language: 'ro' })
    assert.equal(languageOf('ana@example.com'), 'ro')
    assert.equal(db.prepare("SELECT count(*) AS n FROM activity_logs WHERE action = 'account.renamed'").get()?.n, renames)
    assert.equal((await update({ language: 'de' })).status, 400)
  })
})
