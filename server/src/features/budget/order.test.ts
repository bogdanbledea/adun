import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { describe, test } from 'node:test'
import { appClient, createUser, signIn } from '../../../test/auth.ts'
import { tempDatabase } from '../../../test/helpers.ts'

const { db, dataDir } = tempDatabase()
await createUser(db, 'ana@example.com')
await createUser(db, 'ion@example.com', 'Ion Ionescu')

const client = await appClient(db, dataDir)
const ana = await signIn(client, 'ana@example.com')
const ion = await signIn(client, 'ion@example.com')

interface Month {
  categories: { id: string; name: string; entries: { id: string; description: string }[] }[]
}

const send = (method: string, path: string, cookie: string, body?: unknown) =>
  client.request(method, path, { body, headers: { cookie } })
const codeOf = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code
const readMonth = async (monthKey: string, cookie = ana) =>
  (await (await send('GET', `/api/months/${monthKey}`, cookie)).json()) as Month
const layout = (month: Month) =>
  month.categories.map((category) => [category.name, category.entries.map((entry) => entry.description)])

async function add(monthKey: string, categoryName: string, description: string, cookie = ana) {
  const res = await send('POST', '/api/entries', cookie, {
    monthKey,
    categoryName,
    description,
    type: 'expense',
    amountBani: 1000,
  })
  assert.equal(res.status, 201)
}

for (const cookie of [ana, ion]) {
  await send('POST', '/api/months', cookie, { monthKey: '2026-01' })
  await add('2026-01', 'Home', 'Rent', cookie)
  await add('2026-01', 'Home', 'Electricity', cookie)
  await add('2026-01', 'Home', 'Water', cookie)
  await add('2026-01', 'Car', 'Fuel', cookie)
}
await send('POST', '/api/months', ana, { monthKey: '2026-02' })
await add('2026-02', 'Home', 'Rent')

const categoryIds = async (monthKey = '2026-01', cookie = ana) =>
  (await readMonth(monthKey, cookie)).categories.map((category) => category.id)
const entryIds = async (name: string, monthKey = '2026-01', cookie = ana) =>
  (await readMonth(monthKey, cookie)).categories
    .find((category) => category.name === name)
    ?.entries.map((entry) => entry.id) ?? []

describe('PUT /api/categories/order', () => {
  test('puts the month’s categories in the order given', async () => {
    const res = await send('PUT', '/api/categories/order', ana, { ids: (await categoryIds()).reverse() })
    assert.equal(res.status, 200)
    assert.deepEqual(layout(await readMonth('2026-01')), [
      ['Car', ['Fuel']],
      ['Home', ['Rent', 'Electricity', 'Water']],
    ])
  })

  test('refuses a list that is not every category of the month', async () => {
    const [car] = await categoryIds()
    const missing = await send('PUT', '/api/categories/order', ana, { ids: [car] })
    assert.equal(missing.status, 409)
    assert.equal(await codeOf(missing), 'order_changed')

    const mixed = await send('PUT', '/api/categories/order', ana, {
      ids: [...(await categoryIds()), ...(await categoryIds('2026-02'))],
    })
    assert.equal(mixed.status, 409)
    assert.equal(await codeOf(mixed), 'order_changed')
  })

  test('another user’s categories are not found, and nothing changes', async () => {
    const theirs = await categoryIds('2026-01', ion)
    const res = await send('PUT', '/api/categories/order', ana, { ids: [...theirs].reverse() })
    assert.equal(res.status, 404)
    assert.equal(await codeOf(res), 'category_not_found')

    const mixed = await send('PUT', '/api/categories/order', ana, { ids: [...(await categoryIds()), theirs[0]] })
    assert.equal(mixed.status, 404)
    assert.deepEqual(
      layout(await readMonth('2026-01', ion)).map(([name]) => name),
      ['Home', 'Car'],
    )
  })

  test('a new category still goes last', async () => {
    await add('2026-01', 'Health', 'Pharmacy')
    assert.deepEqual(
      layout(await readMonth('2026-01')).map(([name]) => name),
      ['Car', 'Home', 'Health'],
    )
  })
})

describe('PUT /api/entries/order', () => {
  test('puts the category’s entries in the order given', async () => {
    const [rent, electricity, water] = await entryIds('Home')
    const res = await send('PUT', '/api/entries/order', ana, { ids: [water, rent, electricity] })
    assert.equal(res.status, 200)
    assert.deepEqual(layout(await readMonth('2026-01'))[1], ['Home', ['Water', 'Rent', 'Electricity']])
  })

  test('refuses a list that is not every entry of the category', async () => {
    const home = await entryIds('Home')
    const partial = await send('PUT', '/api/entries/order', ana, { ids: home.slice(1) })
    assert.equal(partial.status, 409)
    assert.equal(await codeOf(partial), 'order_changed')

    const mixed = await send('PUT', '/api/entries/order', ana, { ids: [...home, ...(await entryIds('Car'))] })
    assert.equal(mixed.status, 409)
  })

  test('another user’s entries are not found, and nothing changes', async () => {
    const theirs = await entryIds('Home', '2026-01', ion)
    const res = await send('PUT', '/api/entries/order', ana, { ids: [...theirs].reverse() })
    assert.equal(res.status, 404)
    assert.equal(await codeOf(res), 'entry_not_found')
    assert.deepEqual(await entryIds('Home', '2026-01', ion), theirs)
  })

  test('a new entry still goes last', async () => {
    await add('2026-01', 'Home', 'Internet')
    assert.deepEqual(layout(await readMonth('2026-01'))[1], ['Home', ['Water', 'Rent', 'Electricity', 'Internet']])
  })
})

describe('order lists', () => {
  test('must hold IDs, each once, and at least one', async () => {
    const [id] = await entryIds('Car')
    for (const ids of [[], [id, id], ['not-an-id'], undefined]) {
      for (const path of ['/api/categories/order', '/api/entries/order']) {
        const res = await send('PUT', path, ana, { ids })
        assert.equal(res.status, 400, `${path} ${JSON.stringify(ids)}`)
      }
    }
  })

  test('an unknown ID is not found', async () => {
    const res = await send('PUT', '/api/entries/order', ana, { ids: [randomUUID()] })
    assert.equal(res.status, 404)
  })
})
