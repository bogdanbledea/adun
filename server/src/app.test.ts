import assert from 'node:assert/strict'
import type { AddressInfo } from 'node:net'
import { after, test } from 'node:test'
import { createApp } from './app.ts'

const server = createApp().listen(0)
const { port } = server.address() as AddressInfo
const baseUrl = `http://localhost:${String(port)}`

after(() => server.close())

test('GET /health answers ok', async () => {
  const res = await fetch(`${baseUrl}/health`)
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { status: 'ok' })
})

test('responses do not name the framework', async () => {
  const res = await fetch(`${baseUrl}/health`)
  assert.equal(res.headers.get('x-powered-by'), null)
})
