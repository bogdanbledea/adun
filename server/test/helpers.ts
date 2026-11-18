import fs from 'node:fs'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { after } from 'node:test'
import { loadConfig, type Config } from '../src/config.ts'
import { migrate, openDatabase, type Database } from '../src/db.ts'
import type { Logger } from '../src/lib/log.ts'
import { createLogger } from '../src/lib/log.ts'

/* Shared test helpers. Each test file gets its own temporary data directory,
   removed when the file's tests finish. */

export function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'adun-test-'))
  after(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })
  return dir
}

// A migrated database in a temporary data directory.
export function tempDatabase(): { db: Database; dataDir: string } {
  const dataDir = tempDir()
  const db = openDatabase(dataDir)
  migrate(db)
  after(() => {
    if (db.isOpen) db.close()
  })
  return { db, dataDir }
}

export const TEST_APP_URL = 'http://app.test'

export function testConfig(dataDir: string, env: Record<string, string> = {}): Config {
  return loadConfig({ APP_URL: TEST_APP_URL, ADUN_DATA_DIR: dataDir, ...env })
}

// A logger that keeps its lines, parsed, for the test to look at.
export function captureLogger(): { log: Logger; lines: Record<string, unknown>[] } {
  const lines: Record<string, unknown>[] = []
  const log = createLogger('debug', { write: (line) => lines.push(JSON.parse(line) as Record<string, unknown>) })
  return { log, lines }
}

export interface RequestOptions {
  body?: unknown
  // A null value removes a default header.
  headers?: Record<string, string | null>
}

export interface TestClient {
  url: string
  request(method: string, path: string, options?: RequestOptions): Promise<Response>
}

/* Starts a server on a random local port for the current test file. Requests
   look like the web app's own: same-origin fetch metadata and a JSON body. */
export async function testClient(app: { listen(port: number, host: string): Server }): Promise<TestClient> {
  const server = app.listen(0, '127.0.0.1')
  await new Promise<void>((resolve) => server.once('listening', resolve))
  after(() => {
    server.close()
  })
  const url = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`

  return {
    url,
    request(method, urlPath, { body, headers = {} } = {}) {
      const merged: Record<string, string | null> = {
        'sec-fetch-site': 'same-origin',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...headers,
      }
      const sent = Object.fromEntries(
        Object.entries(merged).filter((entry): entry is [string, string] => entry[1] !== null),
      )
      return fetch(`${url}${urlPath}`, {
        method,
        headers: sent,
        body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
      })
    },
  }
}
