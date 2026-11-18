import assert from 'node:assert/strict'
import { test } from 'node:test'
import express from 'express'
import { pinoHttp } from 'pino-http'
import { z } from 'zod'
import { captureLogger, testClient } from '../../test/helpers.ts'
import { conflict, errorHandler } from './errors.ts'
import { validate } from './validate.ts'

const { log, lines } = captureLogger()
const app = express()
app.use(pinoHttp({ logger: log, genReqId: () => 'req-1', autoLogging: false }))
app.use(express.json())
app.get('/boom', () => {
  throw new Error('database password is hunter2')
})
app.get('/conflict', () => {
  throw conflict('month_exists', 'This month already exists.')
})
app.post('/validate', (req, res) => {
  const body = validate(z.object({ name: z.string().min(1), amount: z.number() }), req.body)
  res.json(body)
})
app.use(errorHandler)

const client = await testClient(app)

test('an HttpError keeps its status and code', async () => {
  const res = await client.request('GET', '/conflict')
  assert.equal(res.status, 409)
  assert.deepEqual(await res.json(), { error: { code: 'month_exists', message: 'This month already exists.' } })
})

test('an unexpected error is a 500 with the request ID and no internals', async () => {
  const res = await client.request('GET', '/boom')
  assert.equal(res.status, 500)
  const body = await res.text()
  assert.doesNotMatch(body, /hunter2/)
  assert.deepEqual(JSON.parse(body), {
    error: { code: 'internal_error', message: 'Something went wrong. Reference: req-1', requestId: 'req-1' },
  })
  // The details go to the log instead, tied to the same request.
  const entry = lines.find((line) => line.msg === 'http.unhandled_error')
  assert.equal((entry?.req as { id: string } | undefined)?.id, 'req-1')
  assert.match(String((entry?.err as { stack: string } | undefined)?.stack), /hunter2/)
})

test('validate returns typed data or a 400 naming the first bad field', async () => {
  const ok = await client.request('POST', '/validate', { body: { name: 'Rent', amount: 1 } })
  assert.deepEqual(await ok.json(), { name: 'Rent', amount: 1 })

  const bad = await client.request('POST', '/validate', { body: { name: 'Rent', amount: 'a lot' } })
  assert.equal(bad.status, 400)
  assert.deepEqual(await bad.json(), { error: { code: 'invalid_input', message: 'Invalid value: amount.' } })
})
