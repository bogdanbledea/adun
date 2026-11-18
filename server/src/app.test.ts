import assert from 'node:assert/strict'
import { beforeEach, describe, test } from 'node:test'
import { captureLogger, tempDatabase, TEST_APP_URL, testClient, testConfig } from '../test/helpers.ts'
import { createApp } from './app.ts'
import { silentLogger } from './lib/log.ts'

const { db, dataDir } = tempDatabase()
const { log, lines } = captureLogger()
const client = await testClient(createApp({ config: testConfig(dataDir), db, log }))

beforeEach(() => { lines.length = 0 })

describe('health', () => {
  test('answers ok when the database is readable', async () => {
    const res = await client.request('GET', '/health')
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), { status: 'ok' })
  })

  test('answers 503 when it is not', async () => {
    const other = tempDatabase()
    const app = createApp({ config: testConfig(other.dataDir), db: other.db, log: silentLogger })
    const otherClient = await testClient(app)
    other.db.close()
    const res = await otherClient.request('GET', '/health')
    assert.equal(res.status, 503)
    assert.deepEqual(await res.json(), { status: 'unavailable' })
  })

  test('is not logged', async () => {
    await (await client.request('GET', '/health')).text()
    assert.equal(lines.length, 0)
  })
})

describe('request log', () => {
  test('every response carries a request ID the client cannot choose', async () => {
    const res = await client.request('GET', '/health', { headers: { 'x-request-id': 'chosen' } })
    assert.match(res.headers.get('x-request-id') ?? '', /^[0-9a-f-]{36}$/)
  })

  test('logs the ID, method, path without the query string, and status', async () => {
    const res = await client.request('GET', '/api/nothing?token=secret')
    await res.text()
    const line = lines.find((entry) => entry.msg === 'request completed')
    assert.deepEqual(line?.req, { id: res.headers.get('x-request-id'), method: 'GET', path: '/api/nothing' })
    assert.deepEqual(line.res, { statusCode: 404 })
    assert.equal(line.level, 'warn')
    assert.doesNotMatch(JSON.stringify(lines), /secret/)
  })
})

describe('security headers', () => {
  test('are present on every response', async () => {
    for (const url of ['/health', '/api/nothing', '/nothing']) {
      const res = await client.request('GET', url)
      assert.equal(
        res.headers.get('content-security-policy'),
        "default-src 'self';script-src 'self';style-src 'self';img-src 'self' data:;font-src 'self';" +
          "connect-src 'self';object-src 'none';base-uri 'none';frame-ancestors 'none';form-action 'self'",
        url,
      )
      assert.equal(res.headers.get('strict-transport-security'), 'max-age=31536000; includeSubDomains', url)
      assert.equal(res.headers.get('referrer-policy'), 'no-referrer', url)
      assert.equal(res.headers.get('x-content-type-options'), 'nosniff', url)
      assert.equal(res.headers.get('x-powered-by'), null, url)
      assert.equal(res.headers.get('access-control-allow-origin'), null, url)
    }
  })

  test('API responses are never stored', async () => {
    assert.equal((await client.request('GET', '/api/nothing')).headers.get('cache-control'), 'no-store')
  })

  test('rate limit headers are sent', async () => {
    const res = await client.request('GET', '/health')
    assert.match(res.headers.get('ratelimit-policy') ?? '', /"300-in-5min"; q=300; w=300/)
  })
})

describe('errors', () => {
  test('an unknown path is a 404 in the common shape', async () => {
    const res = await client.request('GET', '/api/nothing')
    assert.equal(res.status, 404)
    assert.deepEqual(await res.json(), { error: { code: 'not_found', message: 'Not found.' } })
  })

  test('malformed JSON is a 400', async () => {
    const res = await client.request('POST', '/api/nothing', { body: '{"broken"' })
    assert.equal(res.status, 400)
    assert.equal(((await res.json()) as { error: { code: string } }).error.code, 'invalid_json')
  })

  test('a body over 32 KB is a 413', async () => {
    const res = await client.request('POST', '/api/nothing', { body: { text: 'x'.repeat(33 * 1024) } })
    assert.equal(res.status, 413)
    assert.equal(((await res.json()) as { error: { code: string } }).error.code, 'payload_too_large')
  })
})

describe('same-origin guard', () => {
  // Passing the guard reaches the 404 for the unknown path; failing it is a 403.
  const cases: [string, Record<string, string | null>, number][] = [
    ['same-origin fetch metadata', {}, 404],
    ['cross-site fetch metadata', { 'sec-fetch-site': 'cross-site' }, 403],
    ['same-site fetch metadata', { 'sec-fetch-site': 'same-site' }, 403],
    ['no fetch metadata, our Origin', { 'sec-fetch-site': null, origin: TEST_APP_URL }, 404],
    ['no fetch metadata, another Origin', { 'sec-fetch-site': null, origin: 'http://evil.test' }, 403],
    ['neither header', { 'sec-fetch-site': null }, 403],
  ]
  for (const [name, headers, status] of cases) {
    test(`POST with ${name}: ${String(status)}`, async () => {
      const res = await client.request('POST', '/api/nothing', { headers })
      assert.equal(res.status, status)
    })
  }

  test('reads are not checked', async () => {
    const res = await client.request('GET', '/api/nothing', { headers: { 'sec-fetch-site': 'cross-site' } })
    assert.equal(res.status, 404)
  })

  test('a body must be JSON, which a plain HTML form cannot send', async () => {
    const res = await client.request('POST', '/api/nothing', {
      body: 'name=x',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    })
    assert.equal(res.status, 415)
  })
})
