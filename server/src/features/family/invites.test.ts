import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { appClient, createUser, signIn } from '../../../test/auth.ts'
import { tempDatabase } from '../../../test/helpers.ts'
import { LIMITS } from '../../lib/limits.ts'
import * as repo from './repository.ts'
import { INVITE_ALPHABET, newInviteCode, normalizeCode } from './service.ts'

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

const send = (method: string, path: string, cookie: string, body?: unknown) =>
  client.request(method, path, { body, headers: { cookie } })
const codeOf = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code
const lastActivity = (userId: string) =>
  db.prepare('SELECT action, metadata FROM activity_logs WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(userId)

async function invite(cookie = ana): Promise<{ code: string; expiresAt: string }> {
  const res = await send('POST', '/api/family/invites', cookie)
  assert.equal(res.status, 201)
  return (await res.json()) as { code: string; expiresAt: string }
}

const join = (code: string, cookie: string) => send('POST', '/api/family/join', cookie, { code })

await send('POST', '/api/family', ana, { name: 'Popescu' })

test('a code has 8 characters that are hard to misread', () => {
  for (let i = 0; i < 50; i++) {
    const code = newInviteCode()
    assert.match(code, /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$/)
  }
  assert.doesNotMatch(INVITE_ALPHABET, /[01OIL]/)
  assert.equal(normalizeCode(' abcd-2345 '), 'ABCD2345')
})

describe('an invite', () => {
  test('is made by the owner, lasts 7 days, and only its hash is kept', async () => {
    const before = Date.now()
    const { code, expiresAt } = await invite()
    const days = (Date.parse(expiresAt) - before) / (24 * 60 * 60 * 1000)
    assert.ok(days > 6.99 && days < 7.01)
    const stored = db.prepare('SELECT code_hash FROM family_invites').all()
    assert.equal(stored.length, 1)
    assert.notEqual(stored[0]?.code_hash, code)
    assert.ok(!JSON.stringify(stored).includes(code))
    assert.deepEqual({ ...lastActivity(anaId) }, { action: 'family.invite_created', metadata: null })
  })

  test('is not made by a member who is not the owner, or by someone in no family', async () => {
    assert.equal((await send('POST', '/api/family/invites', eva)).status, 409)
    const { code } = await invite()
    assert.equal((await join(code, ion)).status, 201)
    const res = await send('POST', '/api/family/invites', ion)
    assert.equal(res.status, 403)
    assert.equal(await codeOf(res), 'family_owner_required')
    await send('POST', '/api/family/leave', ion)
  })

  test('ends the unused one before it', async () => {
    const first = await invite()
    await invite()
    const res = await join(first.code, ion)
    assert.equal(res.status, 400)
    assert.equal(await codeOf(res), 'family_invite_invalid')
  })
})

describe('joining', () => {
  test('with a code typed loosely adds a member', async () => {
    const { code } = await invite()
    const res = await join(`${code.slice(0, 4).toLowerCase()} ${code.slice(4)}`, ion)
    assert.equal(res.status, 201)
    const family = (await res.json()) as { name: string; role: string; members: { displayName: string }[] }
    assert.equal(family.name, 'Popescu')
    assert.equal(family.role, 'member')
    assert.deepEqual(
      family.members.map((m) => m.displayName),
      ['Ana', 'Ion'],
    )
    assert.deepEqual({ ...lastActivity(ionId) }, { action: 'family.joined', metadata: '{"name":"Popescu"}' })
  })

  test('uses the code up', async () => {
    await send('POST', '/api/family/leave', ion)
    const { code } = await invite()
    await join(code, ion)
    const res = await join(code, eva)
    assert.equal(res.status, 400)
    assert.equal(await codeOf(res), 'family_invite_invalid')
  })

  test('is refused to someone already in a family, and the code still works', async () => {
    const { code } = await invite()
    const res = await join(code, ion)
    assert.equal(res.status, 409)
    assert.equal(await codeOf(res), 'family_already_member')
    assert.equal((await join(code, eva)).status, 201)
    await send('POST', '/api/family/leave', eva)
  })

  test('answers the same to a wrong code and an expired one', async () => {
    const { code } = await invite()
    db.prepare("UPDATE family_invites SET expires_at = '2026-01-01T00:00:00.000Z' WHERE used_at IS NULL").run()
    for (const tried of [code, 'ZZZZZZZZ', 'nonsense']) {
      const res = await join(tried, eva)
      assert.equal(res.status, 400)
      assert.equal(await codeOf(res), 'family_invite_invalid')
    }
  })

  test('is refused once the family is full, and the code still works when there is room', async () => {
    // A client of its own: the tries above used up most of the join limit.
    const fresh = await appClient(db, dataDir)
    const join = (code: string, cookie: string) =>
      fresh.request('POST', '/api/family/join', { body: { code }, headers: { cookie } })
    const { code } = await invite()
    const familyId = repo.membershipOf(db, anaId)?.familyId as string
    const extra: string[] = []
    for (let i = repo.listMembers(db, familyId).length; i < LIMITS.familyMembers; i++) {
      const email = `member${String(i)}@example.com`
      await createUser(db, email, `Member ${String(i)}`)
      extra.push(idOf(email))
      repo.insertMember(db, { familyId, userId: idOf(email), role: 'member', now: new Date().toISOString() })
    }
    const res = await join(code, eva)
    assert.equal(res.status, 409)
    assert.equal(await codeOf(res), 'limit_reached')

    repo.deleteMember(db, familyId, extra[0] as string)
    assert.equal((await join(code, eva)).status, 201)
  })
})

test('joining is limited to 10 tries per 15 minutes from one address', async () => {
  const fresh = await appClient(db, dataDir)
  const cookie = await signIn(fresh, 'eva@example.com')
  const statuses = []
  for (let i = 0; i < 11; i++) {
    const res = await fresh.request('POST', '/api/family/join', { body: { code: 'ZZZZZZZZ' }, headers: { cookie } })
    statuses.push(res.status)
  }
  assert.equal(statuses.at(-1), 429)
  assert.ok(statuses.slice(0, 10).every((status) => status !== 429))
})
