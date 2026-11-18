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
