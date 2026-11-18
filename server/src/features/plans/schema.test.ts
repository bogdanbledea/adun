import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { describe, test } from 'node:test'
import { createUser } from '../../../test/auth.ts'
import { tempDatabase, tempDir } from '../../../test/helpers.ts'
import { migrate, MIGRATIONS_DIR, openDatabase } from '../../db.ts'

/* Payment plans and their instalments guard their own data: an instalment
   cannot point at another user's plan, and a plan cannot go while it still
   has instalments. */

const { db } = tempDatabase()
await createUser(db, 'ana@example.com')
await createUser(db, 'ion@example.com', 'Ion Ionescu')

const idOf = (email: string) => (db.prepare('SELECT id FROM users WHERE email = ?').get(email) as { id: string }).id
const anaId = idOf('ana@example.com')
const ionId = idOf('ion@example.com')
const now = new Date().toISOString()

function addPlan(userId: string, fields: Record<string, unknown> = {}): string {
  const id = randomUUID()
  const plan = { installments: 12, total_bani: 120000, first_month_key: '2026-01', purchase_date: null, ...fields }
  db.prepare(
    `INSERT INTO payment_plans (id, user_id, name, installments, total_bani, first_month_key, category_name,
                                purchase_date, created_at)
     VALUES (?, ?, 'Phone', ?, ?, ?, 'Instalments', ?, ?)`,
  ).run(
    id,
    userId,
    plan.installments,
    plan.total_bani,
    plan.first_month_key,
    plan.purchase_date as string | null,
    now,
  )
  return id
}

function addMonth(userId: string): { monthId: string; categoryId: string } {
  const monthId = randomUUID()
  const categoryId = randomUUID()
  db.prepare("INSERT INTO months (id, user_id, month_key, created_at) VALUES (?, ?, '2026-01', ?)").run(monthId, userId, now)
  db.prepare("INSERT INTO categories (id, user_id, month_id, name) VALUES (?, ?, ?, 'Instalments')").run(
    categoryId,
    userId,
    monthId,
  )
  return { monthId, categoryId }
}

function addInstallment(userId: string, month: { monthId: string; categoryId: string }, planId: string | null, index: number | null) {
  db.prepare(
    `INSERT INTO entries (id, user_id, month_id, category_id, description, type, amount_bani, plan_id,
                          installment_index, created_at)
     VALUES (?, ?, ?, ?, 'Phone', 'expense', 10000, ?, ?, ?)`,
  ).run(randomUUID(), userId, month.monthId, month.categoryId, planId, index, now)
}

const anaMonth = addMonth(anaId)

describe('payment plans', () => {
  test('have 1 to 360 instalments of a total above zero', () => {
    assert.doesNotThrow(() => addPlan(anaId, { installments: 1 }))
    assert.doesNotThrow(() => addPlan(anaId, { installments: 360 }))
    for (const installments of [0, 361]) {
      assert.throws(() => addPlan(anaId, { installments }), /CHECK constraint failed/, String(installments))
    }
    assert.throws(() => addPlan(anaId, { total_bani: 0 }), /CHECK constraint failed/)
  })

  test('start in a month and may have a purchase date', () => {
    assert.throws(() => addPlan(anaId, { first_month_key: '2026-13' }), /CHECK constraint failed/)
    assert.doesNotThrow(() => addPlan(anaId, { purchase_date: '2025-12-20' }))
    assert.throws(() => addPlan(anaId, { purchase_date: '20 Dec' }), /CHECK constraint failed/)
  })
})

describe('instalments', () => {
  test('have both a plan and an index, or neither', () => {
    const plan = addPlan(anaId)
    assert.doesNotThrow(() => { addInstallment(anaId, anaMonth, plan, 1) })
    assert.doesNotThrow(() => { addInstallment(anaId, anaMonth, null, null) })
    assert.throws(() => { addInstallment(anaId, anaMonth, plan, null) }, /CHECK constraint failed/)
    assert.throws(() => { addInstallment(anaId, anaMonth, null, 1) }, /CHECK constraint failed/)
    assert.throws(() => { addInstallment(anaId, anaMonth, plan, 361) }, /CHECK constraint failed/)
  })

  test('cannot belong to a plan of another user', () => {
    const ionPlan = addPlan(ionId)
    assert.throws(() => { addInstallment(anaId, anaMonth, ionPlan, 1) }, /FOREIGN KEY constraint failed/)
  })

  test('keep their plan from being deleted', () => {
    const plan = addPlan(anaId)
    addInstallment(anaId, anaMonth, plan, 1)
    assert.throws(() => db.prepare('DELETE FROM payment_plans WHERE id = ?').run(plan), /FOREIGN KEY constraint failed/)
    db.prepare('DELETE FROM entries WHERE plan_id = ?').run(plan)
    assert.doesNotThrow(() => db.prepare('DELETE FROM payment_plans WHERE id = ?').run(plan))
  })
})

test('deleting a user removes their plans and instalments', async () => {
  await createUser(db, 'maria@example.com', 'Maria Pop')
  const mariaId = idOf('maria@example.com')
  addInstallment(mariaId, addMonth(mariaId), addPlan(mariaId), 1)

  db.prepare('DELETE FROM users WHERE id = ?').run(mariaId)
  for (const table of ['payment_plans', 'entries']) {
    assert.equal(db.prepare(`SELECT count(*) AS n FROM ${table} WHERE user_id = ?`).get(mariaId)?.n, 0, table)
  }
})

test('adding plans keeps the entries there were', () => {
  const migrationsDir = tempDir()
  for (const name of fs.readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith('.sql'))) {
    if (name < '0011') fs.copyFileSync(path.join(MIGRATIONS_DIR, name), path.join(migrationsDir, name))
  }
  const old = openDatabase(tempDir())
  migrate(old, migrationsDir)
  // A user row as the table was then; createUser writes today's columns.
  const userId = 'u'
  old
    .prepare("INSERT INTO users (id, email, display_name, password_hash, created_at) VALUES (?, 'ana@example.com', 'Ana', 'x', ?)")
    .run(userId, now)
  old.prepare("INSERT INTO months (id, user_id, month_key, created_at) VALUES ('m', ?, '2026-01', ?)").run(userId, now)
  old.prepare("INSERT INTO categories (id, user_id, month_id, name) VALUES ('c', ?, 'm', 'Home')").run(userId)
  old
    .prepare(
      `INSERT INTO entries (id, user_id, month_id, category_id, description, type, amount_bani, sort_order, created_at)
       VALUES ('e', ?, 'm', 'c', 'Rent', 'expense', 100, 3, ?)`,
    )
    .run(userId, now)

  assert.equal(migrate(old)[0], '0011_payment_plans.sql')
  assert.deepEqual({ ...old.prepare('SELECT description, amount_bani, sort_order, plan_id FROM entries').get() }, {
    description: 'Rent',
    amount_bani: 100,
    sort_order: 3,
    plan_id: null,
  })
  // The entries still point at months, which still cascades.
  old.prepare("DELETE FROM months WHERE id = 'm'").run()
  assert.equal(old.prepare('SELECT count(*) AS n FROM entries').get()?.n, 0)
  old.close()
})
