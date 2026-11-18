import { createApp } from '../src/app.ts'
import type { Database } from '../src/db.ts'
import { register } from '../src/features/auth/service.ts'
import { silentLogger } from '../src/lib/log.ts'
import { testClient, testConfig, type TestClient } from './helpers.ts'

/* Accounts and sessions for tests of signed-in endpoints. */

export const TEST_PASSWORD = 'Corect-cal-baterie-1'

export async function createUser(db: Database, email: string, displayName = 'Ana Popescu'): Promise<void> {
  await register(db, silentLogger, { email, password: TEST_PASSWORD, displayName })
}

/** A new app instance, so each group of tests has its own rate-limit budget. */
export function appClient(db: Database, dataDir: string, env: Record<string, string> = {}): Promise<TestClient> {
  return testClient(createApp({ config: testConfig(dataDir, env), db, log: silentLogger, webRoot: '/nonexistent' }))
}

/** The `name=value` part of a Set-Cookie header, ready to send back as Cookie. */
export function sessionCookie(res: Response): string {
  const header = res.headers.get('set-cookie') ?? ''
  const pair = header.split(';')[0] ?? ''
  if (!pair.includes('=') || pair.endsWith('=')) throw new Error(`No session cookie in: ${header}`)
  return pair
}

export async function signIn(client: TestClient, email: string, password = TEST_PASSWORD): Promise<string> {
  const res = await client.request('POST', '/api/auth/login', { body: { email, password } })
  if (res.status !== 200) throw new Error(`Sign-in failed with ${String(res.status)}`)
  return sessionCookie(res)
}
