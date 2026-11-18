import assert from 'node:assert/strict'
import { test } from 'node:test'
import express from 'express'
import { testClient } from '../../test/helpers.ts'
import { errorHandler } from './errors.ts'
import { limiter } from './rate-limits.ts'

async function clientWithLimit(limit: number, trustProxyHops: number) {
  const app = express()
  app.set('trust proxy', trustProxyHops)
  app.use(limiter(60_000, limit))
  app.get('/', (_req, res) => {
    res.json({ ok: true })
  })
  app.use(errorHandler)
  return testClient(app)
}

test('past the limit, requests get a 429 in the common error shape', async () => {
  const client = await clientWithLimit(2, 0)
  assert.equal((await client.request('GET', '/')).status, 200)
  assert.equal((await client.request('GET', '/')).status, 200)
  const res = await client.request('GET', '/')
  assert.equal(res.status, 429)
  assert.deepEqual(await res.json(), {
    error: { code: 'rate_limited', message: 'Too many requests. Try again later.' },
  })
})

test('behind one proxy, each client address has its own budget', async () => {
  const client = await clientWithLimit(1, 1)
  const from = (ip: string) => client.request('GET', '/', { headers: { 'x-forwarded-for': ip } })
  assert.equal((await from('203.0.113.1')).status, 200)
  assert.equal((await from('203.0.113.2')).status, 200)
  assert.equal((await from('203.0.113.1')).status, 429)
})

test('a client cannot open a new budget by adding its own forwarded address', async () => {
  const client = await clientWithLimit(1, 1)
  // The proxy appends the real address last; whatever the client sent comes first.
  const from = (sent: string) => client.request('GET', '/', { headers: { 'x-forwarded-for': `${sent}, 203.0.113.9` } })
  assert.equal((await from('198.51.100.1')).status, 200)
  assert.equal((await from('198.51.100.2')).status, 429)
})
