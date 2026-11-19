import { transaction, type Database } from '../../db.ts'
import { notFound } from '../../http/errors.ts'
import { logActivity } from '../activity/service.ts'
import { membershipOf } from '../family/repository.ts'
import { listOverrides } from '../food/repository.ts'
import { listReminders } from '../reminders/repository.ts'
import { findUser } from '../user/repository.ts'
import { EXPORT_FORMAT, EXPORT_VERSION, type ExportCategory, type ExportFile } from './format.ts'
import * as repo from './repository.ts'

/* Builds the export file (format.ts) for one user.
   - It holds what the user made and sees in the app: the budget and its
     template, payment plans, reminders, food months with their sources and
     purchases (the family's ones marked shared), calendar corrections and
     the pay-period rule.
   - Never in it: the email address, the password hash, sessions, email links
     and limits, the reminder emails already sent, the family itself, who
     added a purchase, and the activity history (EXCLUDED_TABLES).
   - It is read in one transaction, so it is one consistent moment, and the
     export is recorded in the activity history in the same one. */

/** Tables with a user_id column whose rows are in the export. */
export const EXPORTED_TABLES = [
  'months',
  'categories',
  'entries',
  'payment_plans',
  'reminders',
  'food_budgets',
  'food_purchases',
  'work_calendar_overrides',
]

/** Tables with a user_id column left out of the export, and why. */
export const EXCLUDED_TABLES: Record<string, string> = {
  sessions: 'sign-in records, only hashes of cookies',
  auth_tokens: 'hashes of single-use email links',
  auth_emails: 'send times kept a day for the per-address email limit',
  activity_logs: 'a log of past changes, not data to restore',
  reminder_notifications: 'which reminder emails were sent, so none goes twice',
  family_members: 'the family is joined again with an invite',
}

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  for (const row of rows) {
    const group = groups.get(key(row))
    if (group) group.push(row)
    else groups.set(key(row), [row])
  }
  return groups
}

export function exportData(db: Database, userId: string, now = new Date()): ExportFile {
  return transaction(db, () => {
    const user = findUser(db, userId)
    if (!user) throw notFound()

    const plans = repo.exportPlans(db, userId)
    const planPosition = new Map(plans.map((plan, position) => [plan.id, position]))
    const entries = groupBy(repo.exportEntries(db, userId), (entry) => entry.categoryId)
    const categories = groupBy(repo.exportCategories(db, userId), (category) => category.monthId)
    const categoriesOf = (monthId: string): ExportCategory[] =>
      (categories.get(monthId) ?? []).map((category) => ({
        name: category.name,
        entries: (entries.get(category.id) ?? []).map((entry) => ({
          description: entry.description,
          type: entry.type,
          amountBani: entry.amountBani,
          paymentDate: entry.paymentDate,
          // An instalment's plan is the user's (a foreign key), and its index is set with it.
          installment:
            entry.planId === null
              ? null
              : { plan: planPosition.get(entry.planId) as number, index: entry.installmentIndex as number },
          createdAt: entry.createdAt,
        })),
      }))
    const months = repo.exportMonths(db, userId)
    const template = months.find((month) => month.monthKey === null)

    const familyId = membershipOf(db, userId)?.familyId ?? null
    const purchases = groupBy(repo.exportFoodPurchases(db, userId, familyId), (purchase) => purchase.sourceId)
    const sources = groupBy(repo.exportFoodSources(db, userId, familyId), (source) => source.budgetId)

    const file: ExportFile = {
      format: EXPORT_FORMAT,
      version: EXPORT_VERSION,
      exportedAt: now.toISOString(),
      account: {
        displayName: user.displayName,
        foodPeriodRule: user.foodPeriodRule,
        foodPaydayWorkingDay: user.foodPaydayWorkingDay,
      },
      template: template ? { categories: categoriesOf(template.id) } : null,
      months: months
        .filter((month) => month.monthKey !== null)
        .map((month) => ({ monthKey: month.monthKey ?? '', createdAt: month.createdAt, categories: categoriesOf(month.id) })),
      plans: plans.map((plan) => ({
        name: plan.name,
        installmentCount: plan.installmentCount,
        totalBani: plan.totalBani,
        firstMonthKey: plan.firstMonthKey,
        categoryName: plan.categoryName,
        purchaseDate: plan.purchaseDate,
        closedAt: plan.closedAt,
        createdAt: plan.createdAt,
      })),
      reminders: listReminders(db, userId).map((reminder) => ({
        kind: reminder.kind,
        name: reminder.name,
        subject: reminder.subject,
        dueDate: reminder.dueDate,
        intervalMonths: reminder.intervalMonths,
        leadDays: reminder.leadDays,
        notes: reminder.notes,
        isActive: reminder.isActive,
        createdAt: reminder.createdAt,
      })),
      food: {
        months: repo.exportFoodBudgets(db, userId, familyId).map((budget) => ({
          monthKey: budget.monthKey,
          shared: budget.shared,
          periodStart: budget.periodStart,
          planFrom: budget.planFrom,
          createdAt: budget.createdAt,
          sources: (sources.get(budget.id) ?? []).map((source) => ({
            name: source.name,
            amountBani: source.amountBani,
            createdAt: source.createdAt,
            purchases: (purchases.get(source.id) ?? []).map((purchase) => ({
              merchant: purchase.merchant,
              amountBani: purchase.amountBani,
              spentOn: purchase.spentOn,
              note: purchase.note,
              createdAt: purchase.createdAt,
            })),
          })),
        })),
        calendar: listOverrides(db, userId),
      },
    }
    logActivity(db, userId, 'data.exported')
    return file
  })
}
