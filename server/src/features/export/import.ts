import { randomUUID } from 'node:crypto'
import { transaction, type Database } from '../../db.ts'
import { conflict } from '../../http/errors.ts'
import { logActivity } from '../activity/service.ts'
import { setFoodPeriod } from '../user/repository.ts'
import type { ExportCategory, ExportFile } from './format.ts'
import * as repo from './repository.ts'

/* Brings an export file (format.ts, checked by parseExport) into an account.
   - Only into an empty account, outside a family: nothing is merged, so
     nothing can clash. Whoever wants a fresh start deletes the account and
     registers again.
   - Every row gets a new ID. The account keeps its name and address; the
     pay-period rule comes from the file.
   - The family's food months come back as the user's own, except where the
     file also has the user's own month for the same key: that one wins.
   - It is one transaction with its activity entry: a file that fails
     anywhere, a database check included, changes nothing. */

export interface ImportCounts {
  months: number
  plans: number
  reminders: number
  foodMonths: number
}

export const accountNotEmpty = () =>
  conflict('account_not_empty', 'Import works only into an account with no data, outside a family.')

export function importData(db: Database, userId: string, file: ExportFile, now = new Date()): ImportCounts {
  return transaction(db, () => {
    if (repo.hasData(db, userId)) throw accountNotEmpty()
    const insert = repo.importer(db, userId)
    setFoodPeriod(db, userId, { rule: file.account.foodPeriodRule, paydayWorkingDay: file.account.foodPaydayWorkingDay })

    const planIds = file.plans.map((plan) => {
      const id = randomUUID()
      insert.plan({ id, ...plan })
      return id
    })

    const addMonth = (monthKey: string | null, createdAt: string, categories: ExportCategory[]) => {
      const monthId = randomUUID()
      insert.month({ id: monthId, monthKey, createdAt })
      categories.forEach((category, sortOrder) => {
        const categoryId = randomUUID()
        insert.category({ id: categoryId, monthId, name: category.name, sortOrder })
        category.entries.forEach((entry, entryOrder) => {
          insert.entry({
            id: randomUUID(),
            monthId,
            categoryId,
            description: entry.description,
            type: entry.type,
            amountBani: entry.amountBani,
            paymentDate: entry.paymentDate,
            planId: entry.installment ? (planIds[entry.installment.plan] ?? null) : null,
            installmentIndex: entry.installment?.index ?? null,
            sortOrder: entryOrder,
            createdAt: entry.createdAt,
          })
        })
      })
    }
    if (file.template) addMonth(null, now.toISOString(), file.template.categories)
    for (const month of file.months) addMonth(month.monthKey, month.createdAt, month.categories)

    for (const reminder of file.reminders) insert.reminder({ id: randomUUID(), ...reminder })

    const own = new Set(file.food.months.filter((month) => !month.shared).map((month) => month.monthKey))
    const foodMonths = file.food.months.filter((month) => !month.shared || !own.has(month.monthKey))
    for (const month of foodMonths) {
      const budgetId = randomUUID()
      insert.budget({ id: budgetId, ...month })
      month.sources.forEach((source, sortOrder) => {
        const sourceId = randomUUID()
        insert.source({ id: sourceId, budgetId, sortOrder, ...source })
        for (const purchase of source.purchases) insert.purchase({ id: randomUUID(), budgetId, sourceId, ...purchase })
      })
    }
    for (const day of file.food.calendar) insert.calendarDay({ ...day, createdAt: now.toISOString() })

    const counts = {
      months: file.months.length,
      plans: file.plans.length,
      reminders: file.reminders.length,
      foodMonths: foodMonths.length,
    }
    logActivity(db, userId, 'data.imported', { ...counts })
    return counts
  })
}
