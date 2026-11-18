import { randomUUID } from 'node:crypto'
import { transaction, type Database } from '../../db.ts'
import { forbidden, HttpError } from '../../http/errors.ts'
import type { Logger } from '../../lib/log.ts'
import { logActivity } from '../activity/service.ts'
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
   - With email on, an unconfirmed address is refused, but only after the
     password proved correct.
   - Sessions roll: 30 days from last use, recorded at most once an hour. A user
     keeps at most 10 live sessions; signing in again revokes the oldest. */

const LOCKOUT_THRESHOLD = 5
const LOCKOUT_BASE_MS = 60 * 1000
const LOCKOUT_MAX_MS = 60 * 60 * 1000
export const SESSION_TOUCH_INTERVAL_MS = 60 * 60 * 1000
export const MAX_LIVE_SESSIONS = 10

const iso = (ms: number) => new Date(ms).toISOString()

export function lockoutDelayMs(failures: number): number {
  if (failures < LOCKOUT_THRESHOLD) return 0
  return Math.min(LOCKOUT_BASE_MS * 2 ** (failures - LOCKOUT_THRESHOLD), LOCKOUT_MAX_MS)
}

const invalidCredentials = () => new HttpError(401, 'invalid_credentials', 'Wrong email or password.')
export const wrongPassword = () => new HttpError(401, 'wrong_password', 'The password is not correct.')

export interface Registration {
  email: string
  password: string
  displayName: string
}

export type RegisterResult = { created: true; userId: string } | { created: false }

/** Creates the account unless the address is taken, and says which happened.
    The caller answers the same either way, so nobody can probe for accounts.
    `verified` is false when the address still has to be confirmed by email. */
export async function register(
  db: Database,
  log: Logger,
  input: Registration,
  { verified }: { verified: boolean },
): Promise<RegisterResult> {
  // Hashed before looking at the address, so a taken address costs the same.
  const passwordHash = await passwords.hash(input.password)
  const id = randomUUID()
  const now = new Date().toISOString()
  const created = repo.insertUser(db, {
    id,
    email: input.email,
    displayName: input.displayName,
    passwordHash,
    emailVerifiedAt: verified ? now : null,
    now,
  })
  if (!created) {
    log.info('auth.register_existing')
    return { created: false }
  }
  log.info({ userId: id, verified }, 'auth.registered')
  return { created: true, userId: id }
}

/* Checks a password for an account and applies the lockout. Whatever the
   outcome, it costs exactly one Argon2 verification. */
async function checkPassword(
  db: Database,
  log: Logger,
  account: repo.Credentials | null,
  password: string,
  failureEvent: string,
): Promise<boolean> {
  if (!account) {
    await passwords.verifyDummy(password)
    log.warn({ reason: 'no_account' }, failureEvent)
    return false
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
    log.warn({ userId: account.id, reason: 'locked' }, failureEvent)
    return false
  }
  if (!(await passwords.verify(account.passwordHash, password))) {
    log.warn({ userId: account.id, reason: 'wrong_password', failures: attempt }, failureEvent)
    return false
  }
  repo.clearFailedLogins(db, account.id)
  return true
}

/** Whether this is the account's password, checked and counted towards the
    lockout as a sign-in is. */
export function passwordMatches(db: Database, log: Logger, userId: string, password: string, failureEvent: string): Promise<boolean> {
  return checkPassword(db, log, repo.findCredentialsById(db, userId), password, failureEvent)
}

/** Starts a session and returns the cookie value. */
export function startSession(db: Database, userId: string): string {
  const token = newToken()
  const now = Date.now()
  transaction(db, () => {
    repo.insertSession(db, {
      id: randomUUID(),
      userId,
      tokenHash: hashToken(token),
      expiresAt: iso(now + SESSION_TTL_MS),
      now: iso(now),
    })
    repo.revokeOldestSessions(db, userId, MAX_LIVE_SESSIONS, iso(now))
  })
  return token
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
  if (!(await checkPassword(db, log, account, password, 'auth.login_failed')) || !account) {
    throw invalidCredentials()
  }
  if (!account.emailVerified) {
    throw forbidden('email_not_verified', 'Confirm your email address before signing in.')
  }
  const token = startSession(db, account.id)
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

export function logoutEverywhere(db: Database, userId: string): void {
  transaction(db, () => {
    repo.revokeUserSessions(db, userId, new Date().toISOString())
    logActivity(db, userId, 'account.logged_out_everywhere')
  })
}
