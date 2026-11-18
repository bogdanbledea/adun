import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { appClient, EMAIL_ENV, sessionCookie } from '../../../test/auth.ts'
import { tempDatabase, type TestClient } from '../../../test/helpers.ts'
import { memoryMailer } from '../../email/mailer.ts'

const { db, dataDir } = tempDatabase()

const PASSWORD = 'Corect-cal-baterie-1'

const registration = (email: string, language = 'ro') => ({
  email,
  password: PASSWORD,
  displayName: 'Ana Popescu',
  language,
})

const userRow = (email: string) => db.prepare('SELECT * FROM users WHERE email = ?').get(email)
const codeOf = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code

/** The emails are sent after the answer; wait for the next one. */
async function nextEmail(mailer: ReturnType<typeof memoryMailer>, count: number) {
  for (let i = 0; i < 50 && mailer.sent.length < count; i++) await new Promise((resolve) => setTimeout(resolve, 10))
  const email = mailer.sent[count - 1]
  assert.ok(email, 'no email was sent')
  return email
}

const tokenIn = (text: string) => /#token=([A-Za-z0-9_-]{43})/.exec(text)?.[1] ?? ''

/** Registers with email on; returns the browser's sign-up cookie and the link's token. */
async function register(client: TestClient, mailer: ReturnType<typeof memoryMailer>, email: string, language = 'ro') {
  const before = mailer.sent.length
  const res = await client.request('POST', '/api/auth/register', { body: registration(email, language) })
  assert.equal(res.status, 201)
  const signup = sessionCookie(res)
  const sent = await nextEmail(mailer, before + 1)
  return { signup, token: tokenIn(sent.text), sent }
}

describe('with email on', async () => {
  const mailer = memoryMailer()
  const client = await appClient(db, dataDir, EMAIL_ENV, mailer)
  const verify = (body: Record<string, string>, cookie?: string) =>
    client.request('POST', '/api/auth/verify-email', { body, headers: cookie ? { cookie } : {} })
  const login = (email: string, password = PASSWORD) =>
    client.request('POST', '/api/auth/login', { body: { email, password } })

  test('registering creates an unconfirmed account and emails a link, in the language asked for', async () => {
    const res = await client.request('POST', '/api/auth/register', { body: registration('ana@example.com') })
    const header = res.headers.get('set-cookie') ?? ''
    assert.match(header, /^adun_signup=[A-Za-z0-9_-]{43};/)
    assert.match(header, /HttpOnly/)
    assert.match(header, /SameSite=Strict/)
    assert.equal(userRow('ana@example.com')?.email_verified_at, null)

    const sent = await nextEmail(mailer, 1)
    assert.equal(sent.kind, 'verify_email')
    assert.equal(sent.to, 'ana@example.com')
    assert.equal(sent.subject, 'Confirmă adresa de email')
    assert.match(sent.text, /http:\/\/app\.test\/verifica-email#token=[A-Za-z0-9_-]{43}/)

    const english = await register(client, mailer, 'john@example.com', 'en')
    assert.equal(english.sent.subject, 'Confirm your email address')
  })

  test('a taken address gets the same answer, cookie included, and no link', async () => {
    const before = mailer.sent.length
    const res = await client.request('POST', '/api/auth/register', { body: registration('ana@example.com') })
    assert.equal(res.status, 201)
    assert.match(res.headers.get('set-cookie') ?? '', /^adun_signup=/)
    await new Promise((resolve) => setTimeout(resolve, 50))
    assert.equal(mailer.sent.length, before)
  })

  test('signing in waits for the confirmation, but only tells someone who knows the password', async () => {
    await register(client, mailer, 'ion@example.com')
    const right = await login('ion@example.com')
    assert.equal(right.status, 403)
    assert.equal(await codeOf(right), 'email_not_verified')

    const wrong = await login('ion@example.com', 'Gresit-cal-baterie-1')
    assert.equal(wrong.status, 401)
    assert.equal(await codeOf(wrong), 'invalid_credentials')
  })

  test('the link signs in at once in the browser that registered', async () => {
    const { signup, token } = await register(client, mailer, 'maria@example.com')
    const res = await verify({ token }, signup)
    assert.equal(res.status, 200)
    assert.equal(((await res.json()) as { user: { email: string } }).user.email, 'maria@example.com')
    const cookies = res.headers.getSetCookie()
    assert.ok(cookies.some((cookie) => /^adun_session=[A-Za-z0-9_-]{43};/.test(cookie)), 'signed in')
    assert.ok(cookies.some((cookie) => /^adun_signup=;/.test(cookie)), 'sign-up cookie cleared')
    assert.ok(userRow('maria@example.com')?.email_verified_at)
    assert.equal((await login('maria@example.com')).status, 200)
  })

  test('opened elsewhere, the link asks for the password and stays unused until it gets it', async () => {
    const { token } = await register(client, mailer, 'elena@example.com')

    const asked = await verify({ token })
    assert.deepEqual(await asked.json(), { user: null, passwordRequired: true })
    assert.equal(asked.headers.get('set-cookie'), null)
    assert.equal(userRow('elena@example.com')?.email_verified_at, null)

    const wrong = await verify({ token, password: 'Gresit-cal-baterie-1' })
    assert.equal(wrong.status, 401)
    assert.equal(await codeOf(wrong), 'wrong_password')
    assert.equal(userRow('elena@example.com')?.failed_login_count, 1, 'counts towards the lockout')

    const right = await verify({ token, password: PASSWORD })
    assert.equal(right.status, 200)
    assert.match(right.headers.get('set-cookie') ?? '', /adun_session=[A-Za-z0-9_-]{43}/)
    assert.ok(userRow('elena@example.com')?.email_verified_at)
  })

  test('another browser’s sign-up cookie does not count as the one that registered', async () => {
    const mine = await register(client, mailer, 'george@example.com')
    const theirs = await register(client, mailer, 'vlad@example.com')
    assert.deepEqual(await (await verify({ token: mine.token }, theirs.signup)).json(), {
      user: null,
      passwordRequired: true,
    })
  })

  test('a link works once, and a mangled one is refused the same way', async () => {
    const { signup, token } = await register(client, mailer, 'ioana@example.com')
    assert.equal((await verify({ token }, signup)).status, 200)
    for (const used of [token, 'not-a-token', '']) {
      const res = await verify({ token: used }, signup)
      assert.equal(res.status, 400)
      assert.equal(await codeOf(res), 'invalid_token')
    }
  })
})

describe('with email off', async () => {
  const mailer = memoryMailer()
  const client = await appClient(db, dataDir, {}, mailer)

  test('a new account is ready at once, with no sign-up cookie and no email', async () => {
    const res = await client.request('POST', '/api/auth/register', { body: registration('dan@example.com') })
    assert.equal(res.status, 201)
    assert.equal(res.headers.get('set-cookie'), null)
    assert.ok(userRow('dan@example.com')?.email_verified_at)
    const login = await client.request('POST', '/api/auth/login', {
      body: { email: 'dan@example.com', password: PASSWORD },
    })
    assert.equal(login.status, 200)
    await new Promise((resolve) => setTimeout(resolve, 50))
    assert.equal(mailer.sent.length, 0)
  })
})

describe('sending the confirmation again', async () => {
  const mailer = memoryMailer()
  const client = await appClient(db, dataDir, EMAIL_ENV, mailer)
  const resend = (email: string) =>
    client.request('POST', '/api/auth/resend-verification', { body: { email, language: 'en' } })
  const settle = () => new Promise((resolve) => setTimeout(resolve, 50))
  // Moves this account's past sends back in time, as if minutes had passed.
  const later = (email: string, minutes: number) =>
    db
      .prepare(
        `UPDATE auth_emails SET sent_at = strftime('%Y-%m-%dT%H:%M:%fZ', sent_at, ?)
         WHERE user_id = (SELECT id FROM users WHERE email = ?)`,
      )
      .run(`-${String(minutes)} minutes`, email)
  const verify = (token: string, cookie: string) =>
    client.request('POST', '/api/auth/verify-email', { body: { token }, headers: { cookie } })

  test('sends a new link for this browser, and the older one stops working', async () => {
    const first = await register(client, mailer, 'radu@example.com')
    later('radu@example.com', 2)

    const before = mailer.sent.length
    const res = await resend('radu@example.com')
    assert.equal(res.status, 200)
    const signup = sessionCookie(res)
    const sent = await nextEmail(mailer, before + 1)
    assert.equal(sent.subject, 'Confirm your email address')

    assert.equal((await verify(first.token, first.signup)).status, 400)
    assert.equal((await verify(tokenIn(sent.text), signup)).status, 200)
  })

  test('every address gets the same answer; only an unconfirmed account gets an email', async () => {
    const before = mailer.sent.length
    for (const email of ['nobody@example.com', 'radu@example.com']) {
      const res = await resend(email)
      assert.equal(res.status, 200)
      assert.deepEqual(await res.json(), { ok: true })
      assert.match(res.headers.get('set-cookie') ?? '', /^adun_signup=/)
    }
    await settle()
    assert.equal(mailer.sent.length, before)
  })

  test('at most one a minute', async () => {
    await register(client, mailer, 'sara@example.com')
    const before = mailer.sent.length
    await resend('sara@example.com')
    await settle()
    assert.equal(mailer.sent.length, before)
  })

  test('past five a day, no email: the newest link works for another day instead', async () => {
    const { signup } = await register(client, mailer, 'toma@example.com')
    let latest = ''
    let latestSignup = signup
    for (let i = 2; i <= 5; i++) {
      later('toma@example.com', 2)
      const before = mailer.sent.length
      const res = await resend('toma@example.com')
      latestSignup = sessionCookie(res)
      latest = tokenIn((await nextEmail(mailer, before + 1)).text)
    }
    // As if the newest link were about to expire.
    db.prepare(
      `UPDATE auth_tokens SET expires_at = ?
       WHERE user_id = (SELECT id FROM users WHERE email = 'toma@example.com')`,
    ).run(new Date(Date.now() + 60 * 1000).toISOString())
    later('toma@example.com', 2)
    const before = mailer.sent.length
    await resend('toma@example.com')
    await settle()
    assert.equal(mailer.sent.length, before, 'no sixth email')

    const expiresIn =
      Date.parse(
        db
          .prepare(
            `SELECT expires_at FROM auth_tokens
             WHERE user_id = (SELECT id FROM users WHERE email = 'toma@example.com')`,
          )
          .get()?.expires_at as string,
      ) - Date.now()
    assert.ok(expiresIn > 23 * 60 * 60 * 1000, 'the newest link was given a full day again')
    assert.equal((await verify(latest, latestSignup)).status, 200)
  })
})

test('with email off, asking for the link again says so, the same for every address', async () => {
  const client = await appClient(db, dataDir)
  for (const email of ['nobody@example.com', 'dan@example.com']) {
    const res = await client.request('POST', '/api/auth/resend-verification', { body: { email } })
    assert.equal(res.status, 403)
    assert.equal(await codeOf(res), 'email_disabled')
  }
})
