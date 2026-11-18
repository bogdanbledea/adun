import assert from 'node:assert/strict'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { describe, test } from 'node:test'
import { silentLogger } from './lib/log.ts'
import { shutdown } from './shutdown.ts'

// A server whose /slow answer waits until release() is called.
async function setup() {
  const { promise: released, resolve: release } = Promise.withResolvers<undefined>()
  const { promise: slowStarted, resolve: started } = Promise.withResolvers<undefined>()
  const server = http.createServer((req, res) => {
    if (req.url === '/slow') {
      started(undefined)
      void released.then(() => res.end('done'))
    } else {
      res.end('ok')
    }
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`
  return { server, url, release, slowStarted }
}

describe('graceful shutdown', () => {
  test('finishes the request in flight and refuses new ones', async () => {
    const { server, url, release, slowStarted } = await setup()

    const inFlight = fetch(`${url}/slow`).then((res) => res.text())
    await slowStarted
    let done = false
    const stopped = shutdown({ server, log: silentLogger }).then(() => { done = true })

    await assert.rejects(fetch(`${url}/`))
    assert.equal(done, false, 'shutdown waits while a request is running')

    release(undefined)
    assert.equal(await inFlight, 'done')
    await stopped
    assert.equal(server.listening, false)
  })

  test('cuts requests that outlast the deadline', async () => {
    const { server, url, release, slowStarted } = await setup()
    const inFlight = fetch(`${url}/slow`)
    await slowStarted

    await shutdown({ server, log: silentLogger, timeoutMs: 50 })
    await assert.rejects(inFlight)
    release(undefined)
  })
})
