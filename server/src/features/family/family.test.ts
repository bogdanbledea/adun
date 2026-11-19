import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { appClient, createUser, signIn, TEST_PASSWORD } from '../../../test/auth.ts'
import { tempDatabase } from '../../../test/helpers.ts'
import * as repo from './repository.ts'

const { db, dataDir } = tempDatabase()
await createUser(db, 'ana@example.com', 'Ana')
await createUser(db, 'ion@example.com', 'Ion')
await createUser(db, 'eva@example.com', 'Eva')

const client = await appClient(db, dataDir)
const ana = await signIn(client, 'ana@example.com')
const ion = await signIn(client, 'ion@example.com')
const eva = await signIn(client, 'eva@example.com')
const idOf = (email: string) => (db.prepare('SELECT id FROM users WHERE email = ?').get(email) as { id: string }).id
const anaId = idOf('ana@example.com')
const ionId = idOf('ion@example.com')
const evaId = idOf('eva@example.com')

interface Family {
  name: string
  members: { userId: string; displayName: string; role: string }[]
  role: string
}

const send = (method: string, path: string, cookie: string, body?: unknown) =>
  client.request(method, path, { body, headers: { cookie } })
const codeOf = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code
const familyOf = async (cookie: string) => (await (await send('GET', '/api/family', cookie)).json()) as Family | null
const lastActivity = (userId: string) =>
  db.prepare('SELECT action, metadata FROM activity_logs WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(userId)

/** Adds the user to the family the owner is in, as a join would. */
function addMember(ownerId: string, userId: string): void {
  const membership = repo.membershipOf(db, ownerId)
  assert.ok(membership)
  repo.insertMember(db, { familyId: membership.familyId, userId, role: 'member', now: new Date().toISOString() })
}

describe('a family', () => {
  test('is none at first', async () => {
    assert.equal(await familyOf(ana), null)
  })

  test('is made with its maker as owner', async () => {
    const res = await send('POST', '/api/family', ana, { name: '  Popescu ' })
    assert.equal(res.status, 201)
    const family = (await res.json()) as Family
    assert.equal(family.name, 'Popescu')
    assert.equal(family.role, 'owner')
    assert.deepEqual(
      family.members.map((m) => [m.displayName, m.role]),
      [['Ana', 'owner']],
    )
    assert.deepEqual({ ...lastActivity(anaId) }, { action: 'family.created', metadata: '{"name":"Popescu"}' })
  })

  test('is one per user', async () => {
    const res = await send('POST', '/api/family', ana, { name: 'Alta' })
    assert.equal(res.status, 409)
    assert.equal(await codeOf(res), 'family_already_member')
  })

  test('needs a name of 1 to 128 characters', async () => {
    for (const name of ['', '   ', 'x'.repeat(129)]) {
      assert.equal((await send('POST', '/api/family', ion, { name })).status, 400, name)
    }
  })

  test('is renamed only by its owner', async () => {
    addMember(anaId, ionId)
    const refused = await send('PATCH', '/api/family', ion, { name: 'Ionescu' })
    assert.equal(refused.status, 403)
    assert.equal(await codeOf(refused), 'family_owner_required')

    const res = await send('PATCH', '/api/family', ana, { name: 'Casa' })
    assert.equal(res.status, 200)
    assert.equal(((await res.json()) as Family).name, 'Casa')
    assert.equal((await familyOf(ion))?.name, 'Casa')
    assert.deepEqual({ ...lastActivity(anaId) }, { action: 'family.renamed', metadata: '{"name":"Casa"}' })
  })

  test('cannot be renamed by someone in no family', async () => {
    const res = await send('PATCH', '/api/family', eva, { name: 'Eva' })
    assert.equal(res.status, 409)
    assert.equal(await codeOf(res), 'family_not_member')
  })
})

describe('the owner role', () => {
  test('goes to another member when the owner hands it on', async () => {
    const res = await send('POST', '/api/family/owner', ana, { userId: ionId })
    assert.equal(res.status, 200)
    const family = (await res.json()) as Family
    assert.equal(family.role, 'member')
    assert.deepEqual(
      family.members.map((m) => [m.displayName, m.role]),
      [
        ['Ana', 'member'],
        ['Ion', 'owner'],
      ],
    )
    assert.deepEqual({ ...lastActivity(anaId) }, { action: 'family.owner_transferred', metadata: '{"name":"Ion"}' })
  })

  test('is handed on only by the owner', async () => {
    const res = await send('POST', '/api/family/owner', ana, { userId: anaId })
    assert.equal(res.status, 403)
  })

  test('goes only to another member of the family', async () => {
    for (const userId of [ionId, evaId, '00000000-0000-4000-8000-000000000000']) {
      const res = await send('POST', '/api/family/owner', ion, { userId })
      assert.equal(res.status, 400)
      assert.equal(await codeOf(res), 'family_invalid_member')
    }
  })
})

describe('leaving', () => {
  test('is refused to an owner with other members', async () => {
    const res = await send('POST', '/api/family/leave', ion)
    assert.equal(res.status, 409)
    assert.equal(await codeOf(res), 'family_transfer_required')
  })

  test('takes a member out, and the family carries on', async () => {
    const res = await send('POST', '/api/family/leave', ana)
    assert.deepEqual(await res.json(), { ok: true, dissolved: false })
    assert.equal(await familyOf(ana), null)
    assert.deepEqual(
      (await familyOf(ion))?.members.map((m) => m.displayName),
      ['Ion'],
    )
    assert.deepEqual({ ...lastActivity(anaId) }, { action: 'family.left', metadata: '{"name":"Casa"}' })
  })

  test('by the last member ends the family', async () => {
    const res = await send('POST', '/api/family/leave', ion)
    assert.deepEqual(await res.json(), { ok: true, dissolved: true })
    assert.equal(db.prepare('SELECT count(*) AS n FROM families').get()?.n, 0)
    assert.deepEqual({ ...lastActivity(ionId) }, { action: 'family.dissolved', metadata: '{"name":"Casa"}' })
  })

  test('is refused to someone in no family', async () => {
    const res = await send('POST', '/api/family/leave', eva)
    assert.equal(res.status, 409)
    assert.equal(await codeOf(res), 'family_not_member')
  })
})

describe('deleting an account', () => {
  const deleteAccount = async (cookie: string) => {
    await send('POST', '/api/auth/confirm-password', cookie, { password: TEST_PASSWORD })
    assert.equal((await send('DELETE', '/api/user', cookie)).status, 200)
  }

  test('of an owner hands the role to the member who joined first', async () => {
    await createUser(db, 'dan@example.com', 'Dan')
    const dan = await signIn(client, 'dan@example.com')
    await send('POST', '/api/family', dan, { name: 'Dan' })
    addMember(idOf('dan@example.com'), evaId)
    addMember(idOf('dan@example.com'), ionId)
    await deleteAccount(dan)
    assert.deepEqual(
      (await familyOf(eva))?.members.map((m) => [m.displayName, m.role]),
      [
        ['Eva', 'owner'],
        ['Ion', 'member'],
      ],
    )
  })

  test('of the last member deletes the family', async () => {
    await send('POST', '/api/family/owner', eva, { userId: ionId })
    await send('POST', '/api/family/leave', eva)
    await deleteAccount(ion)
    assert.equal(db.prepare('SELECT count(*) AS n FROM families').get()?.n, 0)
  })
})

test('the family endpoints need a session', async () => {
  assert.equal((await client.request('GET', '/api/family')).status, 401)
})
