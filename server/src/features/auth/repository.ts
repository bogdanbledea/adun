import type { Database } from '../../db.ts'

/* SQL for accounts. Instants are ISO-8601 UTC strings, which compare
   correctly as text. */

export interface NewUser {
  id: string
  email: string
  displayName: string
  passwordHash: string
  privacyPolicyVersion: string
  now: string
}

/** Returns false when the address is already taken. */
export function insertUser(db: Database, user: NewUser): boolean {
  const result = db
    .prepare(
      `INSERT INTO users (id, email, display_name, password_hash,
                          privacy_accepted_at, privacy_policy_version, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT DO NOTHING`,
    )
    .run(user.id, user.email, user.displayName, user.passwordHash, user.now, user.privacyPolicyVersion, user.now)
  return result.changes === 1
}

export interface Credentials {
  id: string
  passwordHash: string
}

export function findCredentials(db: Database, email: string): Credentials | null {
  const row = db.prepare('SELECT id, password_hash FROM users WHERE lower(email) = ?').get(email)
  if (!row) return null
  return { id: row.id as string, passwordHash: row.password_hash as string }
}

/** Counts one attempt against the account before its password is checked,
    unless the account is locked. Returns the new count, or null when locked.
    One statement, so attempts arriving together cannot all slip past a lock. */
export function reserveLoginAttempt(db: Database, userId: string, now: string): number | null {
  const row = db
    .prepare(
      `UPDATE users SET failed_login_count = failed_login_count + 1
       WHERE id = ? AND (locked_until IS NULL OR locked_until <= ?)
       RETURNING failed_login_count`,
    )
    .get(userId, now)
  return row ? (row.failed_login_count as number) : null
}

export function setLockedUntil(db: Database, userId: string, lockedUntil: string): void {
  db.prepare('UPDATE users SET locked_until = ? WHERE id = ?').run(lockedUntil, userId)
}

export function clearFailedLogins(db: Database, userId: string): void {
  db.prepare('UPDATE users SET failed_login_count = 0, locked_until = NULL WHERE id = ?').run(userId)
}

// ── Sessions ────────────────────────────────────────────────────────────────

export interface NewSession {
  id: string
  userId: string
  tokenHash: string
  expiresAt: string
  now: string
}

export function insertSession(db: Database, session: NewSession): void {
  db.prepare(
    `INSERT INTO sessions (id, user_id, token_hash, expires_at, last_used_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(session.id, session.userId, session.tokenHash, session.expiresAt, session.now, session.now)
}

export interface LiveSession {
  id: string
  userId: string
  lastUsedAt: string
}

export function findLiveSession(db: Database, tokenHash: string, now: string): LiveSession | null {
  const row = db
    .prepare(
      `SELECT id, user_id, last_used_at FROM sessions
       WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ?`,
    )
    .get(tokenHash, now)
  if (!row) return null
  return { id: row.id as string, userId: row.user_id as string, lastUsedAt: row.last_used_at as string }
}

export function touchSession(db: Database, sessionId: string, now: string, expiresAt: string): void {
  db.prepare('UPDATE sessions SET last_used_at = ?, expires_at = ? WHERE id = ?').run(now, expiresAt, sessionId)
}

export function revokeSessionByTokenHash(db: Database, tokenHash: string, now: string): void {
  db.prepare('UPDATE sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL').run(now, tokenHash)
}
