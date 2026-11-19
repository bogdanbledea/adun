import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { appClient, createUser, signIn, TEST_PASSWORD } from '../../../test/auth.ts'
import { fillAccount } from '../../../test/data.ts'
import { tempDatabase } from '../../../test/helpers.ts'
import { EXCLUDED_TABLES, EXPORTED_TABLES } from './export.ts'
import type { ExportFile } from './format.ts'

const { db, dataDir } = tempDatabase()
await createUser(db, 'ana@example.com', 'Ana')
await createUser(db, 'ion@example.com', 'Ion')
await createUser(db, 'eva@example.com', 'Eva')

const client = await appClient(db, dataDir)
const ana = await signIn(client, 'ana@example.com')
const ion = await signIn(client, 'ion@example.com')
const eva = await signIn(client, 'eva@example.com')
await fillAccount(client, ana)

const send = (method: string, path: string, cookie: string, body?: unknown) =>
  client.request(method, path, { body, headers: { cookie } })
const confirm = (cookie: string) => send('POST', '/api/auth/confirm-password', cookie, { password: TEST_PASSWORD })
const codeOf = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code
async function exportOf(cookie: string): Promise<ExportFile> {
  await confirm(cookie)
  const res = await send('POST', '/api/data/export', cookie)
  assert.equal(res.status, 200)
  return (await res.json()) as ExportFile
}

// Drops every createdAt, which the test cannot know.
const withoutTimes = (value: unknown): unknown =>
  JSON.parse(JSON.stringify(value, (key, item: unknown) => (key === 'createdAt' ? undefined : item)))

describe('POST /api/data/export', () => {
  test('needs the password confirmed first, once per export', async () => {
    const refused = await send('POST', '/api/data/export', ana)
    assert.equal(refused.status, 403)
    assert.equal(await codeOf(refused), 'password_confirmation_required')

    await confirm(ana)
    assert.equal((await send('POST', '/api/data/export', ana)).status, 200)
    assert.equal((await send('POST', '/api/data/export', ana)).status, 403)
  })

  test('is a JSON file to download, never cached', async () => {
    await confirm(ana)
    const res = await send('POST', '/api/data/export', ana)
    assert.match(res.headers.get('content-type') ?? '', /^application\/json/)
    assert.match(res.headers.get('content-disposition') ?? '', /^attachment; filename=adun-export-\d{4}-\d{2}-\d{2}\.json$/)
    assert.equal(res.headers.get('cache-control'), 'no-store')
  })

  test('holds the budget, plans, reminders and food, in order and in bani', async () => {
    const file = await exportOf(ana)
    assert.equal(file.format, 'adun-export')
    assert.equal(file.version, 1)
    assert.match(file.exportedAt, /^\d{4}-\d{2}-\d{2}T.*Z$/)
    assert.deepEqual(file.account, { displayName: 'Ana', foodPeriodRule: 'working_day', foodPaydayWorkingDay: 5 })

    const rent = { description: 'Chirie', type: 'expense', amountBani: 150000, paymentDate: null, installment: null }
    const phone = (index: number) => ({
      name: 'Rate',
      entries: [
        { description: 'Telefon', type: 'expense', amountBani: 100000, paymentDate: null, installment: { plan: 0, index } },
      ],
    })
    assert.deepEqual(withoutTimes(file.template), { categories: [{ name: 'Casă', entries: [rent] }] })
    assert.deepEqual(withoutTimes(file.months), [
      {
        monthKey: '2026-10',
        categories: [
          { name: 'Casă', entries: [rent] },
          {
            name: 'Venituri',
            entries: [
              { description: 'Salariu', type: 'income', amountBani: 650000, paymentDate: '2026-10-10', installment: null },
            ],
          },
        ],
      },
      { monthKey: '2026-11', categories: [phone(1)] },
      { monthKey: '2026-12', categories: [phone(2)] },
      { monthKey: '2027-01', categories: [phone(3)] },
    ])
    assert.deepEqual(withoutTimes(file.plans), [
      {
        name: 'Telefon',
        installmentCount: 3,
        totalBani: 300000,
        firstMonthKey: '2026-11',
        categoryName: 'Rate',
        purchaseDate: '2026-10-20',
        closedAt: null,
      },
    ])
    assert.deepEqual(withoutTimes(file.reminders), [
      {
        kind: 'itp',
        name: 'ITP',
        subject: 'Dacia',
        dueDate: '2027-03-01',
        intervalMonths: 12,
        leadDays: [1, 7],
        notes: null,
        isActive: true,
      },
    ])
    // The 5th working day of November 2026 is Friday the 6th.
    assert.deepEqual(withoutTimes(file.food), {
      months: [
        {
          monthKey: '2026-11',
          shared: false,
          periodStart: '2026-11-06',
          planFrom: '2026-11-18',
          sources: [
            {
              name: 'Card',
              amountBani: 120000,
              purchases: [{ merchant: 'Lidl', amountBani: 4550, spentOn: '2026-11-06', note: 'Fructe' }],
            },
            {
              name: 'Tichete',
              amountBani: 80000,
              purchases: [{ merchant: 'Piața', amountBani: 2000, spentOn: '2026-11-06', note: null }],
            },
          ],
        },
      ],
      calendar: [{ date: '2026-12-24', kind: 'off', note: 'Concediu' }],
    })
  })

  test('holds no address, password hash, IDs or history', async () => {
    const text = JSON.stringify(await exportOf(ana))
    assert.doesNotMatch(text, /ana@example\.com/)
    assert.doesNotMatch(text, /\$argon2/)
    // No UUID of any row.
    assert.doesNotMatch(text, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/)
    assert.doesNotMatch(text, /activity|session|token/i)
  })

  test('holds only the user’s own data', async () => {
    const file = await exportOf(ion)
    assert.deepEqual(withoutTimes({ ...file, exportedAt: null }), {
      format: 'adun-export',
      version: 1,
      exportedAt: null,
      account: { displayName: 'Ion', foodPeriodRule: 'calendar', foodPaydayWorkingDay: 3 },
      template: null,
      months: [],
      plans: [],
      reminders: [],
      food: { months: [], calendar: [] },
    })
  })

  test('holds the family’s food months, marked shared', async () => {
    await send('POST', '/api/family', eva, { name: 'Popescu' })
    await send('PUT', '/api/food/2026-12/sources?today=2026-11-18', eva, { sources: [{ name: 'Cash', amountBani: 50000 }] })
    const { code } = (await (await send('POST', '/api/family/invites', eva)).json()) as { code: string }
    assert.equal((await send('POST', '/api/family/join', ana, { code })).status, 201)

    const file = await exportOf(ana)
    assert.deepEqual(
      file.food.months.map(({ monthKey, shared, sources }) => ({ monthKey, shared, sources: sources.map((s) => s.name) })),
      [
        { monthKey: '2026-11', shared: false, sources: ['Card', 'Tichete'] },
        { monthKey: '2026-12', shared: true, sources: ['Cash'] },
      ],
    )
    // The family itself is not in it.
    assert.doesNotMatch(JSON.stringify(file), /Popescu/)
  })

  test('is recorded in the activity history', async () => {
    await exportOf(ion)
    const last = db
      .prepare(
        "SELECT action FROM activity_logs WHERE user_id = (SELECT id FROM users WHERE email = 'ion@example.com') ORDER BY id DESC",
      )
      .get()
    assert.equal(last?.action, 'data.exported')
  })

  test('needs a session and the app’s own pages', async () => {
    assert.equal((await client.request('POST', '/api/data/export')).status, 401)
    await confirm(ion)
    const res = await client.request('POST', '/api/data/export', {
      headers: { cookie: ion, 'sec-fetch-site': 'cross-site' },
    })
    assert.equal(res.status, 403)
    assert.equal(await codeOf(res), 'cross_site_request')
  })
})

test('every table with a user_id is either exported or left out for a reason', () => {
  const tables = db
    .prepare(
      `SELECT name FROM sqlite_schema s WHERE type = 'table'
       AND EXISTS (SELECT 1 FROM pragma_table_info(s.name) WHERE name = 'user_id') ORDER BY name`,
    )
    .all()
    .map((row) => row.name as string)
  assert.deepEqual(tables, [...EXPORTED_TABLES, ...Object.keys(EXCLUDED_TABLES)].sort())
})
