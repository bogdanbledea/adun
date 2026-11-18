import { randomUUID } from 'node:crypto'
import { transaction, type Database } from '../../db.ts'
import { HttpError } from '../../http/errors.ts'
import type { Logger } from '../../lib/log.ts'
import { passwords } from './password.ts'
import * as repo from './repository.ts'
import { hashToken, newToken, SESSION_TTL_MS } from './session.ts'

/* Sign-in rules:

   - Unknown address, locked account and wrong password all answer with the
     same 401, and all cost one Argon2 verification, so neither the answer nor
     its timing tells them apart.
   - 5 consecutive wrong passwords lock the account for 1 minute, doubling with
     each further failure up to 1 hour. A correct password clears the count.
     An attempt is counted before its password is checked, so a burst of
     parallel attempts gets no more guesses than the same attempts in a row.
   - Sessions roll: 30 days from last use, recorded at most once an hour. */

const LOCKOUT_THRESHOLD = 5
const LOCKOUT_BASE_MS = 60 * 1000
const LOCKOUT_MAX_MS = 60 * 60 * 1000
export const SESSION_TOUCH_INTERVAL_MS = 60 * 60 * 1000

const iso = (ms: number) => new Date(ms).toISOString()

export function lockoutDelayMs(failures: number): number {
  if (failures < LOCKOUT_THRESHOLD) return 0
  return Math.min(LOCKOUT_BASE_MS * 2 ** (failures - LOCKOUT_THRESHOLD), LOCKOUT_MAX_MS)
}

const invalidCredentials = () => new HttpError(401, 'invalid_credentials', 'Wrong email or password.')

export interface Registration {
  email: string
  password: string
  displayName: string
  acceptPrivacyVersion: string
}

/** Creates the account unless the address is taken, and says which happened.
    The caller answers the same either way, so nobody can probe for accounts. */
export async function register(db: Database, log: Logger, input: Registration): Promise<boolean> {
  // Hashed before looking at the address, so a taken address costs the same.
  const passwordHash = await passwords.hash(input.password)
  const id = randomUUID()
  const created = repo.insertUser(db, {
    id,
    email: input.email,
    displayName: input.displayName,
    passwordHash,
    privacyPolicyVersion: input.acceptPrivacyVersion,
    now: new Date().toISOString(),
  })
  if (created) log.info({ userId: id }, 'auth.registered')
  else log.info('auth.register_existing')
  return created
}

/** Checks the password and starts a session; returns the user ID and the
    cookie value. */
export async function login(
  db: Database,
  log: Logger,
  email: string,
  password: string,
): Promise<{ userId: string; token: string }> {
  const account = repo.findCredentials(db, email)
  if (!account) {
    await passwords.verifyDummy(password)
    log.warn({ reason: 'no_account' }, 'auth.login_failed')
    throw invalidCredentials()
  }

  const attempt = transaction(db, () => {
    const count = repo.reserveLoginAttempt(db, account.id, iso(Date.now()))
    if (count === null) return null
    const delay = lockoutDelayMs(count)
    if (delay > 0) repo.setLockedUntil(db, account.id, iso(Date.now() + delay))
    return count
  })
  if (attempt === null) {
    await passwords.verifyDummy(password)
    log.warn({ userId: account.id, reason: 'locked' }, 'auth.login_failed')
    throw invalidCredentials()
  }
  if (!(await passwords.verify(account.passwordHash, password))) {
    log.warn({ userId: account.id, reason: 'wrong_password', failures: attempt }, 'auth.login_failed')
    throw invalidCredentials()
  }
  repo.clearFailedLogins(db, account.id)

  const token = newToken()
  const now = Date.now()
  repo.insertSession(db, {
    id: randomUUID(),
    userId: account.id,
    tokenHash: hashToken(token),
    expiresAt: iso(now + SESSION_TTL_MS),
    now: iso(now),
  })
  log.info({ userId: account.id }, 'auth.login')
  return { userId: account.id, token }
}

export interface Authenticated {
  userId: string
  sessionId: string
  /** True when the expiry moved forward and the cookie should be sent again. */
  renewed: boolean
}

export function authenticate(db: Database, token: string): Authenticated | null {
  const now = Date.now()
  const session = repo.findLiveSession(db, hashToken(token), iso(now))
  if (!session) return null
  const renewed = now - Date.parse(session.lastUsedAt) >= SESSION_TOUCH_INTERVAL_MS
  if (renewed) repo.touchSession(db, session.id, iso(now), iso(now + SESSION_TTL_MS))
  return { userId: session.userId, sessionId: session.id, renewed }
}

export function logout(db: Database, token: string): void {
  repo.revokeSessionByTokenHash(db, hashToken(token), new Date().toISOString())
}
