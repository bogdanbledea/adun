import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { describe, test } from 'node:test'
import { createUser } from '../../../test/auth.ts'
import { tempDatabase } from '../../../test/helpers.ts'
import { hashToken } from '../auth/session.ts'
import { deleteUser } from '../user/repository.ts'
import * as repo from './repository.ts'

/* Families keep their shape: one family per user, one owner per family, and
   invite codes that work once and not after they expire. */

const { db } = tempDatabase()
await createUser(db, 'ana@example.com', 'Ana')
await createUser(db, 'ion@example.com', 'Ion')
await createUser(db, 'eva@example.com', 'Eva')

const idOf = (email: string) => (db.prepare('SELECT id FROM users WHERE email = ?').get(email) as { id: string }).id
const anaId = idOf('ana@example.com')
const ionId = idOf('ion@example.com')
const evaId = idOf('eva@example.com')
const count = (table: string) => db.prepare(`SELECT count(*) AS n FROM ${table}`).get()?.n as number

function addFamily(ownerId: string, name = 'Popescu'): string {
  const id = randomUUID()
  const now = new Date().toISOString()
  repo.insertFamily(db, { id, name, createdBy: ownerId, now })
  repo.insertMember(db, { familyId: id, userId: ownerId, role: 'owner', now })
  return id
}

function addInvite(familyId: string, code: string, expiresAt = '2099-01-01T00:00:00.000Z'): void {
  const now = new Date().toISOString()
  repo.insertInvite(db, { familyId, codeHash: hashToken(code), createdBy: anaId, expiresAt, now })
}

const familyId = addFamily(anaId)

describe('family members', () => {
  test('are in one family at most', () => {
    const other = addFamily(evaId, 'Ionescu')
    assert.throws(() => {
      repo.insertMember(db, { familyId: other, userId: anaId, role: 'member', now: new Date().toISOString() })
    }, /UNIQUE constraint failed/)
    repo.deleteFamily(db, other)
  })

  test('have one owner at a time', () => {
    repo.insertMember(db, { familyId, userId: ionId, role: 'member', now: new Date().toISOString() })
    assert.throws(() => db.prepare("UPDATE family_members SET role = 'owner' WHERE user_id = ?").run(ionId), /UNIQUE/)
    repo.moveOwnership(db, familyId, anaId, ionId)
    assert.deepEqual(repo.membershipOf(db, ionId), { familyId, role: 'owner' })
    assert.deepEqual(repo.membershipOf(db, anaId), { familyId, role: 'member' })
    repo.moveOwnership(db, familyId, ionId, anaId)
  })

  test('are listed in the order they joined, with their display names', () => {
    assert.deepEqual(
      repo.listMembers(db, familyId).map((m) => [m.displayName, m.role]),
      [
        ['Ana', 'owner'],
        ['Ion', 'member'],
      ],
    )
  })

  test('leave the family when their account is deleted, and the family stays', async () => {
    await createUser(db, 'dan@example.com', 'Dan')
    const danId = idOf('dan@example.com')
    const danFamily = addFamily(danId, 'Dan')
    deleteUser(db, danId)
    assert.equal(repo.membershipOf(db, danId), null)
    assert.equal(repo.findFamily(db, danFamily)?.name, 'Dan')
    assert.equal(db.prepare('SELECT created_by FROM families WHERE id = ?').get(danFamily)?.created_by, null)
    repo.deleteFamily(db, danFamily)
  })
})

describe('invites', () => {
  test('are claimed once', () => {
    addInvite(familyId, 'ABCD2345')
    assert.equal(repo.claimInvite(db, hashToken('ABCD2345'), evaId, new Date().toISOString()), familyId)
    assert.equal(repo.claimInvite(db, hashToken('ABCD2345'), ionId, new Date().toISOString()), null)
  })

  test('stop working when they expire', () => {
    addInvite(familyId, 'EXPRD234', '2026-01-01T00:00:00.000Z')
    assert.equal(repo.claimInvite(db, hashToken('EXPRD234'), evaId, '2026-01-01T00:00:00.000Z'), null)
  })

  test('are not found by an unknown code', () => {
    assert.equal(repo.claimInvite(db, hashToken('NOPE2345'), evaId, new Date().toISOString()), null)
  })

  test('that are unused are deleted together, and used ones are kept', () => {
    addInvite(familyId, 'LIVE2345')
    repo.deleteUnusedInvites(db, familyId)
    assert.equal(count('family_invites'), 1)
    assert.equal(repo.claimInvite(db, hashToken('LIVE2345'), evaId, new Date().toISOString()), null)
  })

  test('go with their family, as do its members', () => {
    addInvite(familyId, 'GONE2345')
    repo.deleteFamily(db, familyId)
    assert.equal(count('family_invites'), 0)
    assert.equal(count('family_members'), 0)
  })
})
