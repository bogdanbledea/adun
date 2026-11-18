import assert from 'node:assert/strict'
import { before, describe, test } from 'node:test'
import { appClient, createUser, signIn } from '../../../test/auth.ts'
import { tempDatabase } from '../../../test/helpers.ts'
import { transaction } from '../../db.ts'
import { ACTIVITY_MAX_ENTRIES, logActivity } from './service.ts'

const { db, dataDir } = tempDatabase()
await createUser(db, 'ana@example.com')
await createUser(db, 'ion@example.com', 'Ion Ionescu')

const client = await appClient(db, dataDir)
const ana = await signIn(client, 'ana@example.com')
const ion = await signIn(client, 'ion@example.com')

const idOf = (email: string) => (db.prepare('SELECT id FROM users WHERE email = ?').get(email) as { id: string }).id
const anaId = idOf('ana@example.com')
const ionId = idOf('ion@example.com')
const countOf = (userId: string) => db.prepare('SELECT count(*) AS n FROM activity_logs WHERE user_id = ?').get(userId)?.n

const list = (query: string, cookie: string | null = ana) =>
  client.request('GET', `/api/activity${query}`, { headers: cookie ? { cookie } : {} })

interface Entry {
  id: number
  action: string
  createdAt: string
}

describe('logActivity', () => {
  before(() => {
    db.exec('DELETE FROM activity_logs')
  })

  test('writes inside the caller’s transaction', () => {
    transaction(db, () => {
      logActivity(db, anaId, 'account.renamed')
    })
    const row = db.prepare('SELECT action FROM activity_logs WHERE user_id = ?').get(anaId)
    assert.equal(row?.action, 'account.renamed')
  })

  test('is undone with the change it describes', () => {
    assert.throws(() =>
      transaction(db, () => {
        logActivity(db, anaId, 'account.password_changed')
        throw new Error('the change failed')
      }),
    )
    assert.equal(db.prepare("SELECT 1 FROM activity_logs WHERE action = 'account.password_changed'").get(), undefined)
  })

  test('refuses to run outside a transaction', () => {
    assert.throws(() => {
      logActivity(db, anaId, 'account.renamed')
    }, /inside the transaction/)
  })

  test('keeps only the newest entries of an account', () => {
    db.exec('DELETE FROM activity_logs')
    const old = new Date(Date.now() - 60_000).toISOString()
    const insert = db.prepare("INSERT INTO activity_logs (user_id, action, created_at) VALUES (?, 'account.renamed', ?)")
    transaction(db, () => {
      for (let i = 0; i < ACTIVITY_MAX_ENTRIES; i++) insert.run(anaId, old)
      insert.run(ionId, old)
      logActivity(db, anaId, 'account.password_changed')
    })
    assert.equal(countOf(anaId), ACTIVITY_MAX_ENTRIES)
    assert.ok(db.prepare("SELECT 1 FROM activity_logs WHERE action = 'account.password_changed'").get())
    assert.equal(countOf(ionId), 1, 'another account is not touched')
  })
})

describe('GET /api/activity', () => {
  const start = Date.parse('2026-06-01T00:00:00Z')

  // 120 entries for Ana, one a minute apart so the order is known.
  before(() => {
    db.exec('DELETE FROM activity_logs')
    const insert = db.prepare('INSERT INTO activity_logs (user_id, action, created_at) VALUES (?, ?, ?)')
    transaction(db, () => {
      for (let i = 0; i < 120; i++) {
        insert.run(anaId, i % 2 ? 'account.renamed' : 'account.password_changed', new Date(start + i * 60_000).toISOString())
      }
    })
  })

  test('newest first, 50 by default', async () => {
    const res = await list('')
    assert.equal(res.status, 200)
    const entries = (await res.json()) as Entry[]
    assert.equal(entries.length, 50)
    const newest = entries[0]
    assert.ok(newest)
    assert.deepEqual(Object.keys(newest).sort(), ['action', 'createdAt', 'id'])
    assert.equal(newest.createdAt, new Date(start + 119 * 60_000).toISOString())
    assert.equal(newest.action, 'account.renamed')
    assert.equal(entries[49]?.createdAt, new Date(start + 70 * 60_000).toISOString())
  })

  test('pages with limit and offset, up to 100 at a time', async () => {
    const page = (await (await list('?limit=100&offset=100')).json()) as Entry[]
    assert.equal(page.length, 20)
    assert.equal(page.at(-1)?.createdAt, new Date(start).toISOString())
  })

  test('rejects a bad limit or offset', async () => {
    for (const query of ['?limit=0', '?limit=101', '?limit=abc', '?limit=1.5', '?offset=-1', '?limit=1&limit=2']) {
      assert.equal((await list(query)).status, 400, query)
    }
  })

  test('shows only the caller’s entries', async () => {
    assert.deepEqual(await (await list('', ion)).json(), [])
  })

  test('needs a session', async () => {
    assert.equal((await list('', null)).status, 401)
  })
})

describe('DELETE /api/activity', () => {
  test('erases the caller’s history and no one else’s', async () => {
    transaction(db, () => {
      logActivity(db, anaId, 'account.renamed')
      logActivity(db, ionId, 'account.renamed')
    })
    const res = await client.request('DELETE', '/api/activity', { headers: { cookie: ana } })
    assert.equal(res.status, 200)
    assert.equal(countOf(anaId), 0)
    assert.equal(countOf(ionId), 1)
  })

  test('needs a session', async () => {
    assert.equal((await client.request('DELETE', '/api/activity')).status, 401)
  })
})
