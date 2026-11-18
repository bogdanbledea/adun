import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import { after, beforeEach, test } from 'node:test'
import { tempDatabase } from '../test/helpers.ts'
import { createApp } from './app.ts'
import { createLogger, silentLogger, type Logger } from './lib/log.ts'
import type { Database } from './db.ts'

const lines: Record<string, unknown>[] = []
const log = createLogger('info', { write: (line) => lines.push(JSON.parse(line) as Record<string, unknown>) })

function start(db: Database, logger: Logger) {
  const server = createApp({ db, log: logger }).listen(0)
  after(() => server.close())
  return `http://localhost:${String((server.address() as AddressInfo).port)}`
}

const baseUrl = start(tempDatabase().db, log)

beforeEach(() => { lines.length = 0 })

test('GET /health answers ok when the database is readable', async () => {
  const res = await fetch(`${baseUrl}/health`)
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { status: 'ok' })
})

test('GET /health answers 503 when the database is not', async () => {
  const { db } = tempDatabase()
  const url = start(db, silentLogger)
  db.close()
  const res = await fetch(`${url}/health`)
  assert.equal(res.status, 503)
  assert.deepEqual(await res.json(), { status: 'unavailable' })
})

test('responses do not name the framework', async () => {
  const res = await fetch(`${baseUrl}/health`)
  assert.equal(res.headers.get('x-powered-by'), null)
})

test('every response carries a request ID the client cannot choose', async () => {
  const res = await fetch(`${baseUrl}/health`, { headers: { 'x-request-id': 'chosen' } })
  assert.match(res.headers.get('x-request-id') ?? '', /^[0-9a-f-]{36}$/)
})

test('requests are logged with their ID and path, without the query string', async () => {
  const res = await fetch(`${baseUrl}/nothing?token=secret`)
  await res.text()
  const line = lines.find((entry) => entry.msg === 'request completed')
  assert.deepEqual(line?.req, { id: res.headers.get('x-request-id'), method: 'GET', path: '/nothing' })
  assert.deepEqual(line.res, { statusCode: 404 })
  assert.doesNotMatch(JSON.stringify(lines), /secret/)
})

test('health checks are not logged', async () => {
  await (await fetch(`${baseUrl}/health`)).text()
  assert.equal(lines.length, 0)
})
