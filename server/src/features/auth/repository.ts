import type { Database } from '../../db.ts'

/* SQL for accounts. Instants are ISO-8601 UTC strings, which compare
   correctly as text. */

export interface NewUser {
  id: string
  email: string
  displayName: string
  passwordHash: string
  emailVerifiedAt: string | null
  now: string
}

/** Returns false when the address is already taken. */
export function insertUser(db: Database, user: NewUser): boolean {
  const result = db
    .prepare(
      `INSERT INTO users (id, email, display_name, password_hash, email_verified_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT DO NOTHING`,
    )
    .run(user.id, user.email, user.displayName, user.passwordHash, user.emailVerifiedAt, user.now)
  return result.changes === 1
}

export interface Credentials {
  id: string
  email: string
  displayName: string
  passwordHash: string
  emailVerified: boolean
}

const CREDENTIALS = 'SELECT id, email, display_name, password_hash, email_verified_at FROM users'

function toCredentials(row: Record<string, unknown> | undefined): Credentials | null {
  if (!row) return null
  return {
    id: row.id as string,
    email: row.email as string,
    displayName: row.display_name as string,
    passwordHash: row.password_hash as string,
    emailVerified: row.email_verified_at !== null,
  }
}

export function findCredentials(db: Database, email: string): Credentials | null {
  return toCredentials(db.prepare(`${CREDENTIALS} WHERE lower(email) = ?`).get(email))
}

export function findCredentialsById(db: Database, userId: string): Credentials | null {
  return toCredentials(db.prepare(`${CREDENTIALS} WHERE id = ?`).get(userId))
}

export function markEmailVerified(db: Database, userId: string, now: string): void {
  db.prepare('UPDATE users SET email_verified_at = coalesce(email_verified_at, ?) WHERE id = ?').run(now, userId)
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

/** A new password also ends any lockout and, since it was set through a link
    sent to the address, confirms an address that was not confirmed yet. */
export function setPasswordHash(db: Database, userId: string, passwordHash: string, now: string): void {
  db.prepare(
    `UPDATE users SET password_hash = ?, failed_login_count = 0, locked_until = NULL,
                      email_verified_at = coalesce(email_verified_at, ?)
     WHERE id = ?`,
  ).run(passwordHash, now, userId)
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

/** Records that the password was just typed again on this live session. */
export function setPasswordConfirmed(db: Database, sessionId: string, now: string): boolean {
  const result = db
    .prepare('UPDATE sessions SET password_confirmed_at = :now WHERE id = :sessionId AND revoked_at IS NULL AND expires_at > :now')
    .run({ sessionId, now })
  return result.changes === 1
}

/** Uses up a password confirmation made on this live session since `since`.
    One statement, so two requests cannot both use the same confirmation. */
export function claimPasswordConfirmed(db: Database, sessionId: string, since: string, now: string): boolean {
  const result = db
    .prepare(
      `UPDATE sessions SET password_confirmed_at = NULL
       WHERE id = :sessionId AND revoked_at IS NULL AND expires_at > :now
         AND password_confirmed_at >= :since AND password_confirmed_at <= :now`,
    )
    .run({ sessionId, since, now })
  return result.changes === 1
}

/** Revokes the user's live sessions except the `keep` most recent. */
export function revokeOldestSessions(db: Database, userId: string, keep: number, now: string): void {
  db.prepare(
    `UPDATE sessions SET revoked_at = :now
     WHERE user_id = :userId AND revoked_at IS NULL AND expires_at > :now
       AND id NOT IN (
         SELECT id FROM sessions
         WHERE user_id = :userId AND revoked_at IS NULL AND expires_at > :now
         ORDER BY created_at DESC, rowid DESC
         LIMIT :keep
       )`,
  ).run({ now, userId, keep })
}

/** Ends every live session of the account, except `keepSessionId` if given. */
export function revokeUserSessions(db: Database, userId: string, now: string, keepSessionId: string | null = null): void {
  db.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL AND id IS NOT ?').run(
    now,
    userId,
    keepSessionId,
  )
}

// ── Email link tokens ───────────────────────────────────────────────────────

export type TokenPurpose = 'email_verification' | 'password_reset'

export interface NewToken {
  id: string
  userId: string
  purpose: TokenPurpose
  tokenHash: string
  browserHash: string | null
  expiresAt: string
  now: string
}

export function insertToken(db: Database, token: NewToken): void {
  db.prepare(
    `INSERT INTO auth_tokens (id, user_id, purpose, token_hash, browser_hash, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(token.id, token.userId, token.purpose, token.tokenHash, token.browserHash, token.expiresAt, token.now)
}

export function deleteTokens(db: Database, userId: string, purpose: TokenPurpose): void {
  db.prepare('DELETE FROM auth_tokens WHERE user_id = ? AND purpose = ?').run(userId, purpose)
}

export interface LiveToken {
  userId: string
  browserHash: string | null
}

/** The user of an unused, unexpired token, without using it up. */
export function findLiveToken(db: Database, tokenHash: string, purpose: TokenPurpose, now: string): LiveToken | null {
  const row = db
    .prepare(
      `SELECT user_id, browser_hash FROM auth_tokens
       WHERE token_hash = ? AND purpose = ? AND consumed_at IS NULL AND expires_at > ?`,
    )
    .get(tokenHash, purpose, now)
  return row ? { userId: row.user_id as string, browserHash: row.browser_hash as string | null } : null
}

/** Marks an unused, unexpired token as used and returns its user. One
    statement, so two requests cannot both use the same token. */
export function consumeToken(db: Database, tokenHash: string, purpose: TokenPurpose, now: string): LiveToken | null {
  const row = db
    .prepare(
      `UPDATE auth_tokens SET consumed_at = :now
       WHERE token_hash = :tokenHash AND purpose = :purpose AND consumed_at IS NULL AND expires_at > :now
       RETURNING user_id, browser_hash`,
    )
    .get({ tokenHash, purpose, now })
  return row ? { userId: row.user_id as string, browserHash: row.browser_hash as string | null } : null
}

/** Makes the account's unused link for this purpose, if issued after
    `issuedAfter`, valid until `expiresAt` again. Returns whether there was one. */
export function rearmToken(
  db: Database,
  userId: string,
  purpose: TokenPurpose,
  expiresAt: string,
  issuedAfter: string,
): boolean {
  const result = db
    .prepare(
      `UPDATE auth_tokens SET expires_at = ?
       WHERE user_id = ? AND purpose = ? AND consumed_at IS NULL AND created_at > ?`,
    )
    .run(expiresAt, userId, purpose, issuedAfter)
  return result.changes > 0
}

// ── Emails anyone can request for an address ────────────────────────────────

/** Confirmation link, reset link, or the "account exists" note. */
export type AuthEmailKind = 'verification' | 'reset' | 'notice'

/** Forgets the account's sends before `before`, then lists the ones of this
    kind that are left, newest first. */
export function recentAuthEmails(db: Database, userId: string, kind: AuthEmailKind, before: string): string[] {
  db.prepare('DELETE FROM auth_emails WHERE user_id = ? AND sent_at < ?').run(userId, before)
  return db
    .prepare('SELECT sent_at FROM auth_emails WHERE user_id = ? AND kind = ? ORDER BY sent_at DESC')
    .all(userId, kind)
    .map((row) => row.sent_at as string)
}

export function recordAuthEmail(db: Database, userId: string, kind: AuthEmailKind, now: string): void {
  db.prepare('INSERT INTO auth_emails (user_id, kind, sent_at) VALUES (?, ?, ?)').run(userId, kind, now)
}

/** Removes sessions that can no longer be used: expired or revoked. */
export function deleteDeadSessions(db: Database, now: string): number {
  return Number(db.prepare('DELETE FROM sessions WHERE expires_at <= ? OR revoked_at IS NOT NULL').run(now).changes)
}

/** Removes used links, and unused ones that expired and can no longer be
    re-armed (issued before `rearmableAfter`). */
export function deleteDeadTokens(db: Database, now: string, rearmableAfter: string): number {
  return Number(
    db
      .prepare('DELETE FROM auth_tokens WHERE consumed_at IS NOT NULL OR (expires_at <= ? AND created_at <= ?)')
      .run(now, rearmableAfter).changes,
  )
}

export function deleteAuthEmailsBefore(db: Database, before: string): number {
  return Number(db.prepare('DELETE FROM auth_emails WHERE sent_at < ?').run(before).changes)
}
