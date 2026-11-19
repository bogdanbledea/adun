import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { appClient, createUser, signIn, TEST_PASSWORD } from '../../../test/auth.ts'
import { fillAccount } from '../../../test/data.ts'
import { tempDatabase } from '../../../test/helpers.ts'
import type { ExportFile } from './format.ts'

const { db, dataDir } = tempDatabase()
const client = await appClient(db, dataDir)

const send = (method: string, path: string, cookie: string, body?: unknown) =>
  client.request(method, path, { body, headers: { cookie } })
const codeOf = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code
const messageOf = async (res: Response) => ((await res.json()) as { error: { message: string } }).error.message
const importFile = (cookie: string, file: unknown) => send('POST', '/api/data/import', cookie, file)

let accounts = 0
/** A new, empty account, signed in. */
async function newAccount(): Promise<string> {
  accounts += 1
  const email = `user${String(accounts)}@example.com`
  await createUser(db, email, `User ${String(accounts)}`)
  return signIn(client, email)
}
async function exportOf(cookie: string): Promise<ExportFile> {
  await send('POST', '/api/auth/confirm-password', cookie, { password: TEST_PASSWORD })
  return (await (await send('POST', '/api/data/export', cookie)).json()) as ExportFile
}
const rowCount = (table: string) => db.prepare(`SELECT count(*) AS n FROM ${table}`).get()?.n as number
// What every test compares: the file without the moment of export and the account's name.
const content = ({ account, template, months, plans, reminders, food }: ExportFile) => ({
  rule: [account.foodPeriodRule, account.foodPaydayWorkingDay],
  template: template && JSON.parse(JSON.stringify(template, (key, value: unknown) => (key === 'createdAt' ? undefined : value))) as unknown,
  months,
  plans,
  reminders,
  food,
})

const ana = await newAccount()
await fillAccount(client, ana)
const file = await exportOf(ana)
const empty: ExportFile = { ...file, template: null, months: [], plans: [], reminders: [], food: { months: [], calendar: [] } }

describe('POST /api/data/import', () => {
  test('brings an export back whole into an empty account, without the password', async () => {
    const dan = await newAccount()
    const res = await importFile(dan, file)
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), { ok: true, imported: { months: 4, plans: 1, reminders: 1, foodMonths: 1 } })
    assert.deepEqual(content(await exportOf(dan)), content(file))

    // The app reads it as it reads its own: the plan's instalments, the food month's money.
    const plans = (await (await send('GET', '/api/plans?month=2026-12', dan)).json()) as { remainingCount: number }[]
    assert.equal(plans.length, 1)
    const month = (await (await send('GET', '/api/food/2026-11?today=2026-11-18', dan)).json()) as { spentBani: number }
    assert.equal(month.spentBani, 6550)
  })

  test('is recorded in the activity history with what came in', async () => {
    const eva = await newAccount()
    await importFile(eva, file)
    const res = await send('GET', '/api/activity', eva)
    const [last] = (await res.json()) as { action: string; metadata: unknown }[]
    assert.equal(last?.action, 'data.imported')
    assert.deepEqual(last.metadata, { months: 4, plans: 1, reminders: 1, foodMonths: 1 })
  })

  test('gives every row a new ID', async () => {
    const before = db.prepare('SELECT id FROM entries').all().length
    const radu = await newAccount()
    await importFile(radu, file)
    const ids = db.prepare('SELECT id FROM entries').all().map((row) => row.id)
    // The template's entry, October's two and the three instalments.
    assert.equal(ids.length, before + 6)
    assert.equal(new Set(ids).size, ids.length)
  })

  test('is refused into an account that has data', async () => {
    const res = await importFile(ana, empty)
    assert.equal(res.status, 409)
    assert.equal(await codeOf(res), 'account_not_empty')

    const ion = await newAccount()
    await send('POST', '/api/reminders', ion, { kind: 'rca', name: 'RCA', dueDate: '2027-01-01' })
    assert.equal(await codeOf(await importFile(ion, file)), 'account_not_empty')
  })

  test('is refused to someone in a family', async () => {
    const ion = await newAccount()
    await send('POST', '/api/family', ion, { name: 'Ionescu' })
    assert.equal(await codeOf(await importFile(ion, file)), 'account_not_empty')
  })

  test('a file with one bad row changes nothing', async () => {
    const vlad = await newAccount()
    const tables = ['months', 'entries', 'payment_plans', 'reminders', 'food_budgets', 'food_purchases']
    const before = tables.map(rowCount)
    const bad = structuredClone(file)
    const lastSource = bad.food.months[0]?.sources[1]
    if (lastSource) lastSource.purchases.push({ ...lastSource.purchases[0], amountBani: 0 } as never)

    const res = await importFile(vlad, bad)
    assert.equal(res.status, 400)
    assert.equal(await messageOf(res), 'Invalid value in the file: food.months.0.sources.1.purchases.1.amountBani.')
    assert.deepEqual(tables.map(rowCount), before)
    assert.deepEqual(content(await exportOf(vlad)).rule, ['calendar', 3])
  })

  test('checks every field with the app’s rules', async () => {
    const vlad = await newAccount()
    const cases: [string, (f: ExportFile) => void][] = [
      ['months.0.monthKey', (f) => { if (f.months[0]) f.months[0].monthKey = '2026-13' }],
      ['months.0.categories.0.entries.0.description', (f) => { const e = f.months[0]?.categories[0]?.entries[0]; if (e) e.description = ' ' }],
      ['months.0.categories', (f) => { const c = f.months[0]?.categories; if (c?.[1]) c[1].name = 'Casă' }],
      ['template.categories', (f) => { const e = f.template?.categories[0]?.entries[0]; if (e) e.paymentDate = '2026-10-01' }],
      ['plans.0.installmentCount', (f) => { if (f.plans[0]) f.plans[0].installmentCount = 0 }],
      ['reminders.0.kind', (f) => { if (f.reminders[0]) f.reminders[0].kind = 'tax' as never }],
      ['food.months.0.monthKey', (f) => { if (f.food.months[0]) f.food.months[0].monthKey = '2023-12' }],
      ['food.months.0.sources', (f) => { const s = f.food.months[0]?.sources; if (s?.[1]) s[1].name = 'CARD' }],
      ['food.calendar.0.kind', (f) => { if (f.food.calendar[0]) f.food.calendar[0].kind = 'holiday' as never }],
      ['months.1.createdAt', (f) => { if (f.months[1]) f.months[1].createdAt = 'yesterday' }],
    ]
    for (const [path, spoil] of cases) {
      const bad = structuredClone(file)
      spoil(bad)
      const res = await importFile(vlad, bad)
      assert.equal(res.status, 400, path)
      assert.equal(await messageOf(res), `Invalid value in the file: ${path}.`)
    }
  })

  test('an instalment must match its plan', async () => {
    const vlad = await newAccount()
    const path = 'months.1.categories.0.entries.0.installment'
    const spoilers: ((entry: ExportFile['months'][number]['categories'][number]['entries'][number]) => void)[] = [
      (e) => { e.installment = { plan: 1, index: 1 } },
      (e) => { e.installment = { plan: 0, index: 2 } },
      (e) => { e.installment = { plan: 0, index: 4 } },
      (e) => { e.type = 'income' },
    ]
    for (const spoil of spoilers) {
      const bad = structuredClone(file)
      const entry = bad.months[1]?.categories[0]?.entries[0]
      if (entry) spoil(entry)
      const res = await importFile(vlad, bad)
      assert.equal(res.status, 400)
      assert.equal(await messageOf(res), `Invalid value in the file: ${path}.`)
    }
  })

  test('keeps to the account limits', async () => {
    const vlad = await newAccount()
    const reminder = file.reminders[0]
    const res = await importFile(vlad, { ...empty, reminders: Array.from({ length: 201 }, () => reminder) })
    assert.equal(res.status, 400)
    assert.equal(await messageOf(res), 'Invalid value in the file: reminders.')
  })

  test('refuses a file from a newer version, and one that is not an export', async () => {
    const vlad = await newAccount()
    const newer = await importFile(vlad, { ...file, version: 2 })
    assert.equal(newer.status, 400)
    assert.equal(await codeOf(newer), 'export_too_new')
    for (const other of [{ ...file, format: 'other' }, { ...file, version: 0 }, [], { months: [] }]) {
      assert.equal(await codeOf(await importFile(vlad, other)), 'invalid_export')
    }
  })

  test('brings the family’s months back as the user’s own, unless the user has one for that month', async () => {
    const vlad = await newAccount()
    const [own] = file.food.months
    assert.ok(own)
    const shared = (monthKey: string, name: string) => ({ ...own, monthKey, shared: true, sources: [{ ...own.sources[0], name } as never] })
    const res = await importFile(vlad, {
      ...empty,
      food: { months: [own, shared('2026-11', 'Familie'), shared('2026-12', 'Familie')], calendar: [] },
    })
    assert.deepEqual(((await res.json()) as { imported: unknown }).imported, { months: 0, plans: 0, reminders: 0, foodMonths: 2 })
    const back = (await exportOf(vlad)).food.months
    assert.deepEqual(
      back.map((m) => [m.monthKey, m.shared, m.sources[0]?.name]),
      [['2026-11', false, 'Card'], ['2026-12', false, 'Familie']],
    )
  })

  test('takes a large file, but only from a signed-in user', async () => {
    const vlad = await newAccount()
    const reminders = Array.from({ length: 200 }, () => ({ ...file.reminders[0], notes: 'x'.repeat(500) }))
    const large = { ...empty, reminders }
    assert.ok(JSON.stringify(large).length > 64 * 1024)
    assert.equal((await importFile(vlad, large)).status, 200)

    const anonymous = await client.request('POST', '/api/data/import', { body: large })
    assert.equal(anonymous.status, 401)
    const huge = { ...empty, padding: 'x'.repeat(11 * 1024 * 1024) }
    const tooLarge = await importFile(await newAccount(), huge)
    assert.equal(tooLarge.status, 413)
    // Other routes keep their small limit.
    const elsewhere = await send('PATCH', '/api/user/me', vlad, { displayName: 'x'.repeat(40 * 1024) })
    assert.equal(elsewhere.status, 413)
  })

  test('is refused from another site', async () => {
    const vlad = await newAccount()
    const res = await client.request('POST', '/api/data/import', {
      body: file,
      headers: { cookie: vlad, 'sec-fetch-site': 'cross-site' },
    })
    assert.equal(res.status, 403)
  })
})
