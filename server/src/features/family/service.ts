import { randomInt, randomUUID } from 'node:crypto'
import { transaction, type Database } from '../../db.ts'
import { badRequest, conflict, forbidden } from '../../http/errors.ts'
import { LIMITS, limitReached } from '../../lib/limits.ts'
import { logActivity } from '../activity/service.ts'
import { hashToken } from '../auth/session.ts'
import * as repo from './repository.ts'

/* Families: the people who share food budgets.
   - A user is in at most one family. Whoever makes one is its owner; a
     family with members always has exactly one owner. Only the owner renames
     it, invites and hands the role to another member.
   - An invite is a code of INVITE_LENGTH characters from INVITE_ALPHABET,
     good for INVITE_DAYS days and one use. Only its hash is stored, so it
     is shown once; a new code ends the family's unused one. A wrong, used
     or expired code all get the same answer. Joining is refused to someone
     already in a family, and past LIMITS.familyMembers members.
   - A member leaves freely. An owner with other members hands the role on
     first. The last member to leave ends the family.
   - Deleting an account never fails because of a family: an owner's role
     passes to the member who joined first, and a last member's family goes
     with them.
   - Each change and its activity entry are one transaction. */

export const notInFamily = () => conflict('family_not_member', 'You are not in a family.')
export const alreadyInFamily = () => conflict('family_already_member', 'You are already in a family. Leave it first.')
const ownerRequired = () => forbidden('family_owner_required', 'Only the family’s owner can do this.')

/** The user's family with its members, as every family endpoint answers, or null. */
export function familyView(db: Database, userId: string) {
  const membership = repo.membershipOf(db, userId)
  const family = membership && repo.findFamily(db, membership.familyId)
  if (!membership || !family) return null
  return { name: family.name, createdAt: family.createdAt, members: repo.listMembers(db, family.id), role: membership.role }
}

export type FamilyView = NonNullable<ReturnType<typeof familyView>>

/** The family the user owns. */
export function requireOwner(db: Database, userId: string): string {
  const membership = repo.membershipOf(db, userId)
  if (!membership) throw notInFamily()
  if (membership.role !== 'owner') throw ownerRequired()
  return membership.familyId
}

export function createFamily(db: Database, userId: string, name: string): FamilyView {
  return transaction(db, () => {
    if (repo.membershipOf(db, userId)) throw alreadyInFamily()
    const now = new Date().toISOString()
    const familyId = randomUUID()
    repo.insertFamily(db, { id: familyId, name, createdBy: userId, now })
    repo.insertMember(db, { familyId, userId, role: 'owner', now })
    logActivity(db, userId, 'family.created', { name })
    return familyView(db, userId) as FamilyView
  })
}

export function renameFamily(db: Database, userId: string, name: string): FamilyView {
  return transaction(db, () => {
    repo.renameFamily(db, requireOwner(db, userId), name)
    logActivity(db, userId, 'family.renamed', { name })
    return familyView(db, userId) as FamilyView
  })
}

// Without the characters that are easy to misread: 0 and O, 1, I and L.
export const INVITE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
export const INVITE_LENGTH = 8
export const INVITE_DAYS = 7

export function newInviteCode(): string {
  let code = ''
  for (let i = 0; i < INVITE_LENGTH; i++) code += INVITE_ALPHABET.charAt(randomInt(INVITE_ALPHABET.length))
  return code
}

/** Read aloud or typed from a phone: spaces, dashes and lower case are forgiven. */
export const normalizeCode = (code: string) => code.replace(/[\s-]/g, '').toUpperCase()

export function createInvite(db: Database, userId: string, now = new Date()): { code: string; expiresAt: string } {
  return transaction(db, () => {
    const familyId = requireOwner(db, userId)
    repo.deleteUnusedInvites(db, familyId)
    const code = newInviteCode()
    const expiresAt = new Date(now.getTime() + INVITE_DAYS * 24 * 60 * 60 * 1000).toISOString()
    repo.insertInvite(db, { familyId, codeHash: hashToken(code), createdBy: userId, expiresAt, now: now.toISOString() })
    logActivity(db, userId, 'family.invite_created')
    return { code, expiresAt }
  })
}

export function joinFamily(db: Database, userId: string, code: string): FamilyView {
  return transaction(db, () => {
    if (repo.membershipOf(db, userId)) throw alreadyInFamily()
    const now = new Date().toISOString()
    const familyId = repo.claimInvite(db, hashToken(normalizeCode(code)), userId, now)
    if (!familyId) throw badRequest('family_invite_invalid', 'This invite code is wrong or has expired.')
    // Refusing here rolls the claim back, so the code still works once there is room.
    if (repo.listMembers(db, familyId).length >= LIMITS.familyMembers) throw limitReached()
    repo.insertMember(db, { familyId, userId, role: 'member', now })
    logActivity(db, userId, 'family.joined', { name: repo.findFamily(db, familyId)?.name ?? '' })
    return familyView(db, userId) as FamilyView
  })
}

export function transferOwnership(db: Database, userId: string, newOwnerId: string): FamilyView {
  return transaction(db, () => {
    const familyId = requireOwner(db, userId)
    const target = repo.listMembers(db, familyId).find((m) => m.userId === newOwnerId)
    if (!target || target.userId === userId) {
      throw badRequest('family_invalid_member', 'Choose another member of the family.')
    }
    repo.moveOwnership(db, familyId, userId, target.userId)
    logActivity(db, userId, 'family.owner_transferred', { name: target.displayName })
    return familyView(db, userId) as FamilyView
  })
}

/** Returns whether the family ended with it: the user was its last member. */
export function leaveFamily(db: Database, userId: string): { dissolved: boolean } {
  return transaction(db, () => {
    const membership = repo.membershipOf(db, userId)
    if (!membership) throw notInFamily()
    const { familyId } = membership
    const name = repo.findFamily(db, familyId)?.name ?? ''
    const others = repo.listMembers(db, familyId).filter((m) => m.userId !== userId)

    if (others.length === 0) {
      repo.deleteFamily(db, familyId)
    } else {
      if (membership.role === 'owner') {
        throw conflict('family_transfer_required', 'Hand the owner role to another member before you leave.')
      }
      repo.deleteMember(db, familyId, userId)
    }
    const dissolved = others.length === 0
    logActivity(db, userId, dissolved ? 'family.dissolved' : 'family.left', { name })
    return { dissolved }
  })
}

/** Runs in the account deletion's transaction, before the user row goes;
    the membership itself goes with it (ON DELETE CASCADE). */
export function departForAccountDeletion(db: Database, userId: string): void {
  const membership = repo.membershipOf(db, userId)
  if (!membership) return
  const { familyId } = membership
  const successor = repo.listMembers(db, familyId).find((m) => m.userId !== userId)
  if (!successor) repo.deleteFamily(db, familyId)
  else if (membership.role === 'owner') repo.moveOwnership(db, familyId, userId, successor.userId)
}
