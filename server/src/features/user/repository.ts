import type { Database } from '../../db.ts'

/* The account as the signed-in user sees it. */

export interface PublicUser {
  id: string
  email: string
  displayName: string
  privacyAcceptedAt: string
  privacyPolicyVersion: string
  createdAt: string
}

export function findUser(db: Database, userId: string): PublicUser | null {
  const row = db
    .prepare(
      `SELECT id, email, display_name, privacy_accepted_at, privacy_policy_version, created_at
       FROM users WHERE id = ?`,
    )
    .get(userId)
  if (!row) return null
  return {
    id: row.id as string,
    email: row.email as string,
    displayName: row.display_name as string,
    privacyAcceptedAt: row.privacy_accepted_at as string,
    privacyPolicyVersion: row.privacy_policy_version as string,
    createdAt: row.created_at as string,
  }
}
