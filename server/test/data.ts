import type { TestClient } from './helpers.ts'

/* An account with something in every part of the app, made through the API,
   for the export and import tests. */

export async function fillAccount(client: TestClient, cookie: string): Promise<void> {
  const send = async (method: string, path: string, body?: unknown) => {
    const res = await client.request(method, path, { body, headers: { cookie } })
    if (!res.ok) throw new Error(`${method} ${path} failed with ${String(res.status)}: ${await res.text()}`)
    return res
  }

  await send('PATCH', '/api/user/me', { foodPeriodRule: 'working_day', foodPaydayWorkingDay: 5 })
  await send('POST', '/api/template/entries', {
    categoryName: 'Casă',
    description: 'Chirie',
    type: 'expense',
    amountBani: 150000,
  })
  await send('POST', '/api/months', { monthKey: '2026-10', from: 'template' })
  await send('POST', '/api/entries', {
    monthKey: '2026-10',
    categoryName: 'Venituri',
    description: 'Salariu',
    type: 'income',
    amountBani: 650000,
    paymentDate: '2026-10-10',
  })
  await send('POST', '/api/plans?month=2026-11', {
    name: 'Telefon',
    installmentCount: 3,
    totalBani: 300000,
    firstMonthKey: '2026-11',
    categoryName: 'Rate',
    purchaseDate: '2026-10-20',
  })
  await send('POST', '/api/reminders', {
    kind: 'itp',
    name: 'ITP',
    subject: 'Dacia',
    dueDate: '2027-03-01',
    intervalMonths: 12,
    leadDays: [7, 1],
  })
  await send('PUT', '/api/food/calendar/2026-12-24', { kind: 'off', note: 'Concediu' })
  const month = (await (
    await send('PUT', '/api/food/2026-11/sources?today=2026-11-18', {
      sources: [
        { name: 'Card', amountBani: 120000 },
        { name: 'Tichete', amountBani: 80000 },
      ],
    })
  ).json()) as { period: { start: string }; sources: { id: string }[] }
  const [card, vouchers] = month.sources
  await send('POST', '/api/food/2026-11/purchases', {
    merchant: 'Lidl',
    amountBani: 4550,
    spentOn: month.period.start,
    sourceId: card?.id,
    note: 'Fructe',
  })
  await send('POST', '/api/food/2026-11/purchases', {
    merchant: 'Piața',
    amountBani: 2000,
    spentOn: month.period.start,
    sourceId: vouchers?.id,
  })
}
