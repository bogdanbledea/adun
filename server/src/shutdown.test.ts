import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import path from 'node:path'
import { describe, test } from 'node:test'
import { tempDatabase } from '../test/helpers.ts'
import { DATABASE_FILE, openDatabase } from './db.ts'
import { silentLogger } from './lib/log.ts'
import { shutdown } from './shutdown.ts'

// A server whose /slow answer waits until release() is called.
async function setup() {
  const { db, dataDir } = tempDatabase()
  db.exec("CREATE TABLE note (body TEXT) STRICT; INSERT INTO note VALUES ('kept')")

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
  return { db, dataDir, server, url, release, slowStarted }
}

const walFile = (dataDir: string) => path.join(dataDir, `${DATABASE_FILE}-wal`)

describe('graceful shutdown', () => {
  test('finishes the request in flight, refuses new ones, then checkpoints and closes the database', async () => {
    const { db, dataDir, server, url, release, slowStarted } = await setup()
    assert.ok(fs.statSync(walFile(dataDir)).size > 0)

    const inFlight = fetch(`${url}/slow`).then((res) => res.text())
    await slowStarted
    const stopped = shutdown({ server, db, log: silentLogger })

    await assert.rejects(fetch(`${url}/`))
    assert.ok(db.isOpen, 'the database stays open while a request is running')

    release(undefined)
    assert.equal(await inFlight, 'done')
    await stopped

    assert.equal(server.listening, false)
    assert.equal(db.isOpen, false)
    // Everything is in adun.sqlite itself; the WAL is empty or gone.
    assert.equal(fs.existsSync(walFile(dataDir)) ? fs.statSync(walFile(dataDir)).size : 0, 0)
    const reopened = openDatabase(dataDir)
    assert.deepEqual({ ...reopened.prepare('SELECT body FROM note').get() }, { body: 'kept' })
    reopened.close()
  })

  test('cuts requests that outlast the deadline', async () => {
    const { db, server, url, release, slowStarted } = await setup()
    const inFlight = fetch(`${url}/slow`)
    await slowStarted

    await shutdown({ server, db, log: silentLogger, timeoutMs: 50 })
    await assert.rejects(inFlight)
    assert.equal(db.isOpen, false)
    release(undefined)
  })
})
