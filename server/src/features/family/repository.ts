import type { Database } from '../../db.ts'

/* SQL for families, their members and invite codes. A family ID never comes
   from a request: the service finds it from the signed-in user's own
   membership (membershipOf) and passes it on. */

export type FamilyRole = 'owner' | 'member'

export interface Membership {
  familyId: string
  role: FamilyRole
}

export interface FamilyRow {
  id: string
  name: string
  createdAt: string
}

export interface MemberRow {
  userId: string
  displayName: string
  role: FamilyRole
  joinedAt: string
}

/** The user's family and role, or null when they are in none. */
export function membershipOf(db: Database, userId: string): Membership | null {
  const row = db.prepare('SELECT family_id, role FROM family_members WHERE user_id = ?').get(userId)
  return row ? { familyId: row.family_id as string, role: row.role as FamilyRole } : null
}

export function findFamily(db: Database, familyId: string): FamilyRow | null {
  const row = db.prepare('SELECT id, name, created_at FROM families WHERE id = ?').get(familyId)
  return row ? { id: row.id as string, name: row.name as string, createdAt: row.created_at as string } : null
}

/** In the order they joined: the first is who takes over from an owner whose account goes. */
export function listMembers(db: Database, familyId: string): MemberRow[] {
  return db
    .prepare(
      `SELECT m.user_id, u.display_name, m.role, m.joined_at FROM family_members m
       JOIN users u ON u.id = m.user_id
       WHERE m.family_id = ? ORDER BY m.joined_at, m.id`,
    )
    .all(familyId)
    .map((row) => ({
      userId: row.user_id as string,
      displayName: row.display_name as string,
      role: row.role as FamilyRole,
      joinedAt: row.joined_at as string,
    }))
}

export function insertFamily(db: Database, family: { id: string; name: string; createdBy: string; now: string }): void {
  db.prepare('INSERT INTO families (id, name, created_by, created_at) VALUES (?, ?, ?, ?)').run(
    family.id,
    family.name,
    family.createdBy,
    family.now,
  )
}

export function renameFamily(db: Database, familyId: string, name: string): void {
  db.prepare('UPDATE families SET name = ? WHERE id = ?').run(name, familyId)
}

/** Its members and invites go with it (ON DELETE CASCADE). */
export function deleteFamily(db: Database, familyId: string): void {
  db.prepare('DELETE FROM families WHERE id = ?').run(familyId)
}

export function insertMember(
  db: Database,
  member: { familyId: string; userId: string; role: FamilyRole; now: string },
): void {
  db.prepare('INSERT INTO family_members (family_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)').run(
    member.familyId,
    member.userId,
    member.role,
    member.now,
  )
}

export function deleteMember(db: Database, familyId: string, userId: string): void {
  db.prepare('DELETE FROM family_members WHERE family_id = ? AND user_id = ?').run(familyId, userId)
}

/** Demotes the owner before promoting the other member: a family has one owner at a time. */
export function moveOwnership(db: Database, familyId: string, fromUserId: string, toUserId: string): void {
  const setRole = db.prepare('UPDATE family_members SET role = ? WHERE family_id = ? AND user_id = ?')
  setRole.run('member', familyId, fromUserId)
  setRole.run('owner', familyId, toUserId)
}

// ── Invites ──────────────────────────────────────────────────────────────────

/** Deletes the family's unused codes, so a new one is the only one that works. */
export function deleteUnusedInvites(db: Database, familyId: string): void {
  db.prepare('DELETE FROM family_invites WHERE family_id = ? AND used_at IS NULL').run(familyId)
}

export function insertInvite(
  db: Database,
  invite: { familyId: string; codeHash: string; createdBy: string; expiresAt: string; now: string },
): void {
  db.prepare(
    'INSERT INTO family_invites (family_id, code_hash, created_by, expires_at, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(invite.familyId, invite.codeHash, invite.createdBy, invite.expiresAt, invite.now)
}

/** Marks the live invite with this hash as used by the user and returns its
    family, or null when there is no such invite: unknown, used or expired. */
export function claimInvite(db: Database, codeHash: string, userId: string, now: string): string | null {
  const row = db
    .prepare(
      `UPDATE family_invites SET used_at = ?, used_by = ?
       WHERE code_hash = ? AND used_at IS NULL AND expires_at > ? RETURNING family_id`,
    )
    .get(now, userId, codeHash, now)
  return row ? (row.family_id as string) : null
}
