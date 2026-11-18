import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { describe, test } from 'node:test'
import { createUser } from '../../../test/auth.ts'
import { tempDatabase, tempDir } from '../../../test/helpers.ts'
import { migrate, MIGRATIONS_DIR, openDatabase } from '../../db.ts'

/* The budget tables guard their own data: whatever the code above them does,
   a row cannot point at another user's month or hold an impossible value. */

const { db } = tempDatabase()
await createUser(db, 'ana@example.com')
await createUser(db, 'ion@example.com', 'Ion Ionescu')

const idOf = (email: string) => (db.prepare('SELECT id FROM users WHERE email = ?').get(email) as { id: string }).id
const anaId = idOf('ana@example.com')
const ionId = idOf('ion@example.com')
const now = new Date().toISOString()

function addMonth(userId: string, monthKey: string): string {
  const id = randomUUID()
  db.prepare('INSERT INTO months (id, user_id, month_key, created_at) VALUES (?, ?, ?, ?)').run(id, userId, monthKey, now)
  return id
}

function addCategory(userId: string, monthId: string, name: string): string {
  const id = randomUUID()
  db.prepare('INSERT INTO categories (id, user_id, month_id, name) VALUES (?, ?, ?, ?)').run(id, userId, monthId, name)
  return id
}

function addEntry(
  userId: string,
  monthId: string,
  categoryId: string,
  fields: { type?: string; amountBani?: number } = {},
): string {
  const id = randomUUID()
  db.prepare(
    `INSERT INTO entries (id, user_id, month_id, category_id, description, type, amount_bani, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, userId, monthId, categoryId, 'Rent', fields.type ?? 'expense', fields.amountBani ?? 150000, now)
  return id
}

const anaMonth = addMonth(anaId, '2026-01')
const anaCategory = addCategory(anaId, anaMonth, 'Home')

describe('months', () => {
  test('refuse a key that is not a month', () => {
    for (const key of ['2026-1', '2026-00', '2026-13', '26-01', '2026-01-01', 'abcd-ef']) {
      assert.throws(() => addMonth(anaId, key), /CHECK constraint failed/, key)
    }
  })

  test('exist once per user, and the same month for another user is fine', () => {
    assert.throws(() => addMonth(anaId, '2026-01'), /UNIQUE constraint failed/)
    assert.doesNotThrow(() => addMonth(ionId, '2026-01'))
  })
})

describe('the template', () => {
  const addTemplate = (userId: string) => {
    const id = randomUUID()
    db.prepare('INSERT INTO months (id, user_id, is_template, created_at) VALUES (?, ?, 1, ?)').run(id, userId, now)
    return id
  }

  test('is a month row without a key, once per user', () => {
    const template = addTemplate(anaId)
    assert.throws(() => addTemplate(anaId), /UNIQUE constraint failed/)
    assert.doesNotThrow(() => addTemplate(ionId))
    assert.doesNotThrow(() => addEntry(anaId, template, addCategory(anaId, template, 'Home')))
  })

  test('only the template has no key, and the template has none', () => {
    assert.throws(
      () => db.prepare('INSERT INTO months (id, user_id, created_at) VALUES (?, ?, ?)').run(randomUUID(), anaId, now),
      /CHECK constraint failed/,
    )
    assert.throws(
      () =>
        db
          .prepare("INSERT INTO months (id, user_id, month_key, is_template, created_at) VALUES (?, ?, '2030-01', 1, ?)")
          .run(randomUUID(), anaId, now),
      /CHECK constraint failed/,
    )
  })
})

test('adding the template keeps the months, categories and entries there were', async () => {
  const migrationsDir = tempDir()
  for (const name of fs.readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith('.sql'))) {
    if (name < '0010') fs.copyFileSync(path.join(MIGRATIONS_DIR, name), path.join(migrationsDir, name))
  }
  const old = openDatabase(tempDir())
  migrate(old, migrationsDir)
  await createUser(old, 'ana@example.com')
  const userId = (old.prepare('SELECT id FROM users').get() as { id: string }).id
  old.prepare("INSERT INTO months (id, user_id, month_key, created_at) VALUES ('m', ?, '2026-01', ?)").run(userId, now)
  old.prepare("INSERT INTO categories (id, user_id, month_id, name) VALUES ('c', ?, 'm', 'Home')").run(userId)
  old
    .prepare(
      `INSERT INTO entries (id, user_id, month_id, category_id, description, type, amount_bani, created_at)
       VALUES ('e', ?, 'm', 'c', 'Rent', 'expense', 100, ?)`,
    )
    .run(userId, now)

  assert.equal(migrate(old)[0], '0010_budget_template.sql')
  assert.deepEqual({ ...old.prepare('SELECT month_key, is_template FROM months').get() }, {
    month_key: '2026-01',
    is_template: 0,
  })
  assert.equal(old.prepare("SELECT count(*) AS n FROM entries WHERE month_id = 'm' AND category_id = 'c'").get()?.n, 1)
  // The children still point at months, which still cascades.
  old.prepare("DELETE FROM months WHERE id = 'm'").run()
  assert.equal(old.prepare('SELECT count(*) AS n FROM entries').get()?.n, 0)
  old.close()
})

describe('categories', () => {
  test('have a name once per month', () => {
    assert.throws(() => addCategory(anaId, anaMonth, 'Home'), /UNIQUE constraint failed/)
    assert.doesNotThrow(() => addCategory(anaId, addMonth(anaId, '2026-02'), 'Home'))
  })

  test('cannot belong to a month of another user', () => {
    assert.throws(() => addCategory(ionId, anaMonth, 'Food'), /FOREIGN KEY constraint failed/)
  })
})

describe('entries', () => {
  test('cannot belong to a month of another user', () => {
    assert.throws(() => addEntry(ionId, anaMonth, anaCategory), /FOREIGN KEY constraint failed/)
  })

  test('cannot use a category from another month', () => {
    const march = addMonth(anaId, '2026-03')
    assert.throws(() => addEntry(anaId, march, anaCategory), /FOREIGN KEY constraint failed/)
  })

  test('are income or an expense', () => {
    assert.doesNotThrow(() => addEntry(anaId, anaMonth, anaCategory, { type: 'income' }))
    assert.throws(() => addEntry(anaId, anaMonth, anaCategory, { type: 'credit' }), /CHECK constraint failed/)
  })

  test('hold an amount from 0 to 9,999,999,999 lei in bani', () => {
    assert.doesNotThrow(() => addEntry(anaId, anaMonth, anaCategory, { amountBani: 0 }))
    assert.doesNotThrow(() => addEntry(anaId, anaMonth, anaCategory, { amountBani: 999_999_999_900 }))
    assert.throws(() => addEntry(anaId, anaMonth, anaCategory, { amountBani: -1 }), /CHECK constraint failed/)
    assert.throws(() => addEntry(anaId, anaMonth, anaCategory, { amountBani: 999_999_999_901 }), /CHECK constraint failed/)
  })
})

test('deleting a user removes their months, categories and entries', async () => {
  await createUser(db, 'maria@example.com', 'Maria Pop')
  const mariaId = idOf('maria@example.com')
  const month = addMonth(mariaId, '2026-01')
  addEntry(mariaId, month, addCategory(mariaId, month, 'Home'))

  db.prepare('DELETE FROM users WHERE id = ?').run(mariaId)
  for (const table of ['months', 'categories', 'entries']) {
    assert.equal(db.prepare(`SELECT count(*) AS n FROM ${table} WHERE user_id = ?`).get(mariaId)?.n, 0, table)
  }
})

test('deleting a month removes its categories and entries', () => {
  const month = addMonth(anaId, '2026-04')
  const category = addCategory(anaId, month, 'Home')
  addEntry(anaId, month, category)

  db.prepare('DELETE FROM months WHERE id = ?').run(month)
  assert.equal(db.prepare('SELECT count(*) AS n FROM categories WHERE month_id = ?').get(month)?.n, 0)
  assert.equal(db.prepare('SELECT count(*) AS n FROM entries WHERE month_id = ?').get(month)?.n, 0)
})
