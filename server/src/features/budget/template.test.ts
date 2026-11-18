import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { appClient, createUser, signIn } from '../../../test/auth.ts'
import { tempDatabase } from '../../../test/helpers.ts'
import { transaction } from '../../db.ts'
import { LIMITS } from '../../lib/limits.ts'

const { db, dataDir } = tempDatabase()
await createUser(db, 'ana@example.com')
await createUser(db, 'ion@example.com', 'Ion Ionescu')

const client = await appClient(db, dataDir)
const ana = await signIn(client, 'ana@example.com')
const ion = await signIn(client, 'ion@example.com')
const anaId = (db.prepare("SELECT id FROM users WHERE email = 'ana@example.com'").get() as { id: string }).id

interface SavedEntry {
  id: string
  monthKey: string | null
  categoryName: string
}

interface Template {
  categories: { id: string; name: string; entries: { id: string; description: string; amountBani: number }[] }[]
}

const send = (method: string, path: string, cookie: string, body?: unknown) =>
  client.request(method, path, { body, headers: { cookie } })
const codeOf = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code
const readTemplate = async (cookie = ana) => (await (await send('GET', '/api/template', cookie)).json()) as Template
const layout = (template: Template) =>
  template.categories.map((category) => [category.name, category.entries.map((entry) => entry.description)])
const lastActivity = () => {
  const row = db.prepare('SELECT action, metadata FROM activity_logs WHERE user_id = ? ORDER BY id DESC').get(anaId)
  return { action: row?.action, metadata: JSON.parse(row?.metadata as string) as unknown }
}

const rent = { categoryName: 'Home', description: 'Rent', type: 'expense', amountBani: 150_000 }

async function add(fields: Partial<typeof rent> = {}, cookie = ana): Promise<SavedEntry> {
  const res = await send('POST', '/api/template/entries', cookie, { ...rent, ...fields })
  assert.equal(res.status, 201)
  return (await res.json()) as SavedEntry
}

describe('GET /api/template', () => {
  test('is empty before the first entry', async () => {
    assert.deepEqual(await readTemplate(), { categories: [] })
  })
})

describe('POST /api/template/entries', () => {
  test('adds an entry to the template, and records it with no month', async () => {
    const entry = await add()
    assert.equal(entry.monthKey, null)
    assert.equal(entry.categoryName, 'Home')
    assert.deepEqual(lastActivity(), {
      action: 'entry.created',
      metadata: { description: 'Rent', category: 'Home', type: 'expense', amountBani: 150_000, monthKey: null },
    })
  })

  test('groups entries by category, like a month', async () => {
    await add({ categoryName: 'Salary', description: 'Salary', type: 'income', amountBani: 650_000 })
    await add({ description: 'Electricity', amountBani: 25_000 })
    assert.deepEqual(layout(await readTemplate()), [
      ['Home', ['Rent', 'Electricity']],
      ['Salary', ['Salary']],
    ])
  })

  test('is not a month', async () => {
    assert.deepEqual(await (await send('GET', '/api/months', ana)).json(), [])
  })
})

describe('template entries', () => {
  test('are changed, reordered and deleted like a month’s', async () => {
    const [home] = (await readTemplate()).categories
    const [rentEntry, electricity] = home?.entries ?? []

    const changed = await send('PATCH', `/api/entries/${String(electricity?.id)}`, ana, { amountBani: 30_000 })
    assert.equal(changed.status, 200)
    assert.equal(lastActivity().action, 'entry.updated')

    const ordered = await send('PUT', '/api/entries/order', ana, { ids: [electricity?.id, rentEntry?.id] })
    assert.equal(ordered.status, 200)
    assert.deepEqual(layout(await readTemplate())[0], ['Home', ['Electricity', 'Rent']])

    const deleted = await send('DELETE', `/api/entries/${String(rentEntry?.id)}`, ana)
    assert.equal(deleted.status, 200)
    assert.deepEqual(layout(await readTemplate())[0], ['Home', ['Electricity']])
  })

  test('stay in the template', async () => {
    const [entry] = (await readTemplate()).categories[0]?.entries ?? []
    const res = await send('PATCH', `/api/entries/${String(entry?.id)}`, ana, { monthKey: '2026-01' })
    assert.equal(res.status, 400)
    assert.equal(await codeOf(res), 'template_entry_move')
    assert.deepEqual(await (await send('GET', '/api/months', ana)).json(), [])
  })

  test('another user neither sees nor changes them', async () => {
    assert.deepEqual(await readTemplate(ion), { categories: [] })
    const [entry] = (await readTemplate()).categories[0]?.entries ?? []
    const res = await send('PATCH', `/api/entries/${String(entry?.id)}`, ion, { amountBani: 1 })
    assert.equal(res.status, 404)
    assert.equal((await send('DELETE', `/api/entries/${String(entry?.id)}`, ion)).status, 404)

    await add({ description: 'Their rent' }, ion)
    assert.deepEqual(layout(await readTemplate(ion)), [['Home', ['Their rent']]])
    assert.deepEqual(layout(await readTemplate()), [
      ['Home', ['Electricity']],
      ['Salary', ['Salary']],
    ])
  })
})

describe('template limits', () => {
  test('a template holds as many entries as a month, and the template is not counted as a month', async () => {
    const templateId = (
      db.prepare('SELECT id FROM months WHERE user_id = ? AND is_template = 1').get(anaId) as { id: string }
    ).id
    const home = db.prepare("SELECT id FROM categories WHERE month_id = ? AND name = 'Home'").get(templateId) as {
      id: string
    }
    const count = db.prepare('SELECT count(*) AS n FROM entries WHERE month_id = ?')
    const fill = (target: number) => {
      transaction(db, () => {
        const insert = db.prepare(
          `INSERT INTO entries (id, user_id, month_id, category_id, description, type, amount_bani, created_at)
           VALUES (lower(hex(randomblob(16))), ?, ?, ?, 'Filler', 'expense', 1, '2026-01-01T00:00:00Z')`,
        )
        for (let n = count.get(templateId)?.n as number; n < target; n++) insert.run(anaId, templateId, home.id)
      })
    }

    fill(LIMITS.entriesPerMonth)
    const res = await send('POST', '/api/template/entries', ana, rent)
    assert.equal(res.status, 409)
    assert.equal(await codeOf(res), 'limit_reached')

    // The template is not one of the months, so it never stops a new month.
    db.prepare("DELETE FROM entries WHERE description = 'Filler'").run()
    const months = db.prepare('INSERT INTO months (id, user_id, month_key, created_at) VALUES (?, ?, ?, ?)')
    transaction(db, () => {
      for (let i = 0; i < LIMITS.months - 1; i++) {
        const key = `${String(2000 + Math.floor(i / 12))}-${String((i % 12) + 1).padStart(2, '0')}`
        months.run(`m${String(i)}`, anaId, key, '2026-01-01T00:00:00Z')
      }
    })
    assert.equal((await send('POST', '/api/months', ana, { monthKey: '2099-01' })).status, 201)
    assert.equal((await send('POST', '/api/months', ana, { monthKey: '2099-02' })).status, 409)
  })
})
