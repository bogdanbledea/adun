import { randomUUID } from 'node:crypto'
import { transaction, type Database } from '../../db.ts'
import { badRequest, conflict, forbidden } from '../../http/errors.ts'
import { logActivity } from '../activity/service.ts'
import * as repo from './repository.ts'

/* Families: the people who share food budgets.
   - A user is in at most one family. Whoever makes one is its owner; a
     family with members always has exactly one owner. Only the owner renames
     it, invites and hands the role to another member.
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
