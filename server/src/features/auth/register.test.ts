import assert from 'node:assert/strict'
import { describe, mock, test } from 'node:test'
import { appClient, EMAIL_ENV } from '../../../test/auth.ts'
import { tempDatabase } from '../../../test/helpers.ts'
import { passwords } from './password.ts'

const { db, dataDir } = tempDatabase()

const client = (env: Record<string, string> = {}) => appClient(db, dataDir, env)

const registration = (overrides: Record<string, string> = {}) => ({
  email: 'ana@example.com',
  password: 'Corect-cal-baterie-1',
  displayName: 'Ana Popescu',
  ...overrides,
})

const users = () => db.prepare('SELECT * FROM users ORDER BY created_at').all()
const codeOf = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code

describe('GET /api/auth/status', () => {
  test('says whether registrations are open and whether email is on', async () => {
    const open = await client()
    assert.deepEqual(await (await open.request('GET', '/api/auth/status')).json(), {
      registrationsEnabled: true,
      emailEnabled: false,
    })

    const closed = await client({ REGISTRATIONS_ENABLED: 'false', ...EMAIL_ENV })
    assert.deepEqual(await (await closed.request('GET', '/api/auth/status')).json(), {
      registrationsEnabled: false,
      emailEnabled: true,
    })
  })
})

describe('POST /api/auth/register', async () => {
  const api = await client()
  const register = (body: unknown) => api.request('POST', '/api/auth/register', { body })

  test('creates the account with a hashed password', async () => {
    const res = await register(registration({ email: ' Ana@Example.com ' }))
    assert.equal(res.status, 201)
    assert.deepEqual(await res.json(), { ok: true })

    const [user] = users()
    assert.equal(user?.email, 'ana@example.com')
    assert.equal(user.display_name, 'Ana Popescu')
    assert.match(String(user.password_hash), /^\$argon2id\$/)
    assert.equal(await passwords.verify(String(user.password_hash), 'Corect-cal-baterie-1'), true)
  })

  test('a taken address gets the same answer, at the same cost, and changes nothing', async (t) => {
    const hash = mock.method(passwords, 'hash')
    t.after(() => { hash.mock.restore() })

    const res = await register(registration({ email: 'ANA@example.com', displayName: 'Someone Else' }))
    assert.equal(res.status, 201)
    assert.deepEqual(await res.json(), { ok: true })
    assert.equal(hash.mock.callCount(), 1)
    assert.equal(users().length, 1)
    assert.equal(users()[0]?.display_name, 'Ana Popescu')
  })

  test('refuses a weak password', async () => {
    const res = await register(registration({ email: 'ion@example.com', password: 'parola' }))
    assert.equal(res.status, 400)
    assert.equal(await codeOf(res), 'weak_password')
  })

  test('refuses an invalid address and an empty name', async () => {
    for (const body of [registration({ email: 'not-an-email' }), registration({ displayName: '   ' })]) {
      const res = await register(body)
      assert.equal(res.status, 400)
      assert.equal(await codeOf(res), 'invalid_input')
    }
    assert.equal(users().length, 1)
  })

  test('is refused when registrations are off', async () => {
    const closed = await client({ REGISTRATIONS_ENABLED: 'false' })
    const res = await closed.request('POST', '/api/auth/register', { body: registration({ email: 'ion@example.com' }) })
    assert.equal(res.status, 403)
    assert.equal(await codeOf(res), 'registrations_disabled')
    assert.equal(users().length, 1)
  })
})
