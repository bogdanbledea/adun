import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { appClient, createUser, TEST_PASSWORD } from '../../../test/auth.ts'
import { tempDatabase } from '../../../test/helpers.ts'
import { passwords } from './password.ts'
import { lockoutDelayMs } from './service.ts'

const { db, dataDir } = tempDatabase()

const MINUTE = 60 * 1000
const WRONG = 'Gresit-cal-baterie-1'

const ago = (ms: number) => new Date(Date.now() - ms).toISOString()

function userRow(email: string) {
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email)
  assert.ok(row, `no user ${email}`)
  return row
}

const lockedFor = (email: string) => Date.parse(userRow(email).locked_until as string) - Date.now()

test('the lock starts at 1 minute after the 5th failure and doubles up to 1 hour', () => {
  assert.deepEqual(
    [4, 5, 6, 7, 10, 11, 12, 30].map(lockoutDelayMs),
    [0, MINUTE, 2 * MINUTE, 4 * MINUTE, 32 * MINUTE, 60 * MINUTE, 60 * MINUTE, 60 * MINUTE],
  )
})

describe('signing in with wrong passwords', async () => {
  await createUser(db, 'ana@example.com')
  const client = await appClient(db, dataDir)
  const login = (password: string) =>
    client.request('POST', '/api/auth/login', { body: { email: 'ana@example.com', password } })

  test('5 in a row lock the account, and then the right password is refused the same way', async () => {
    for (let i = 1; i <= 4; i++) {
      assert.equal((await login(WRONG)).status, 401)
      assert.equal(userRow('ana@example.com').locked_until, null, `not locked after ${String(i)}`)
    }
    assert.equal((await login(WRONG)).status, 401)
    assert.equal(userRow('ana@example.com').failed_login_count, 5)
    assert.ok(lockedFor('ana@example.com') > 0.9 * MINUTE && lockedFor('ana@example.com') <= MINUTE)

    const right = await login(TEST_PASSWORD)
    assert.equal(right.status, 401)
    assert.deepEqual(await right.json(), { error: { code: 'invalid_credentials', message: 'Wrong email or password.' } })
    assert.equal(userRow('ana@example.com').failed_login_count, 5, 'attempts while locked do not count')
  })

  test('once the lock ends, another failure locks for twice as long', async () => {
    db.prepare("UPDATE users SET locked_until = ? WHERE email = 'ana@example.com'").run(ago(1000))
    assert.equal((await login(WRONG)).status, 401)
    assert.equal(userRow('ana@example.com').failed_login_count, 6)
    assert.ok(lockedFor('ana@example.com') > 1.9 * MINUTE && lockedFor('ana@example.com') <= 2 * MINUTE)
  })

  test('a correct sign-in once the lock ends clears the count', async () => {
    db.prepare("UPDATE users SET locked_until = ? WHERE email = 'ana@example.com'").run(ago(1000))
    assert.equal((await login(TEST_PASSWORD)).status, 200)
    assert.equal(userRow('ana@example.com').failed_login_count, 0)
    assert.equal(userRow('ana@example.com').locked_until, null)
  })
})

describe('many wrong passwords at once', async () => {
  await createUser(db, 'ion@example.com')
  const client = await appClient(db, dataDir)
  const login = (password: string) =>
    client.request('POST', '/api/auth/login', { body: { email: 'ion@example.com', password } })

  test('get no more real password checks than the same attempts one after another', async (t) => {
    const verify = t.mock.method(passwords, 'verify')
    const dummy = t.mock.method(passwords, 'verifyDummy')
    const guesses = Array.from({ length: 20 }, (_, i) => `Gresit-cal-baterie-${String(i)}`)
    const statuses = (await Promise.all(guesses.map(login))).map((res) => res.status)

    assert.deepEqual(statuses, guesses.map(() => 401))
    assert.equal(userRow('ion@example.com').failed_login_count, 5, 'only the attempts up to the lock were counted')
    assert.ok(lockedFor('ion@example.com') > 0)
    // verifyDummy itself calls verify once, against the dummy hash.
    assert.equal(verify.mock.callCount() - dummy.mock.callCount(), 5, 'five checks against the real hash')
    assert.equal(dummy.mock.callCount(), 15, 'every other attempt cost one dummy check')
    assert.equal((await login(TEST_PASSWORD)).status, 401, 'locked: the right password is refused too')
  })
})
