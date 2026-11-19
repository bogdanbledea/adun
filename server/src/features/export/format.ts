import { z } from 'zod'
import { badRequest } from '../../http/errors.ts'
import { addMonths } from '../../lib/dates.ts'
import { LIMITS } from '../../lib/limits.ts'
import { FIRST_YEAR as FIRST_CALENDAR_YEAR, LAST_YEAR as LAST_CALENDAR_YEAR } from '../food/calendar.ts'
import { MAX_SOURCES, sameName } from '../food/service.ts'
import { REMINDER_KINDS } from '../reminders/repository.ts'
import { LAST_YEAR as LAST_REMINDER_YEAR } from '../reminders/service.ts'

/* The export file: everything a user keeps in the app, to save as a backup
   and bring back into an empty account, here or on another server.

   - The version is the file's own, not the database's: it changes only when
     the file's shape does. An import upgrades an older file step by step.
   - Rows are nested (a month holds its categories, a category its entries),
     so the file carries no IDs. An instalment names its plan by the plan's
     position in `plans`. Lists are in the order the app shows them.
   - Amounts are whole bani, dates YYYY-MM-DD, times ISO in UTC.
   - An import checks the file with the same rules as the API (parseExport). */

export const EXPORT_FORMAT = 'adun-export'
export const EXPORT_VERSION = 1

export interface ExportFile {
  format: typeof EXPORT_FORMAT
  version: typeof EXPORT_VERSION
  exportedAt: string
  account: {
    displayName: string
    foodPeriodRule: 'calendar' | 'working_day'
    foodPaydayWorkingDay: number
  }
  /** Null when the template was never used. */
  template: { categories: ExportCategory[] } | null
  months: ExportMonth[]
  plans: ExportPlan[]
  reminders: ExportReminder[]
  food: {
    months: ExportFoodMonth[]
    calendar: ExportCalendarDay[]
  }
}

export interface ExportMonth {
  monthKey: string
  createdAt: string
  categories: ExportCategory[]
}

export interface ExportCategory {
  name: string
  entries: ExportEntry[]
}

export interface ExportEntry {
  description: string
  type: 'income' | 'expense'
  amountBani: number
  paymentDate: string | null
  /** `plan` is the position of the plan in `plans`. */
  installment: { plan: number; index: number } | null
  createdAt: string
}

export interface ExportPlan {
  name: string
  installmentCount: number
  totalBani: number
  firstMonthKey: string
  categoryName: string
  purchaseDate: string | null
  closedAt: string | null
  createdAt: string
}

export interface ExportReminder {
  kind: 'itp' | 'rca' | 'casco' | 'rovinieta' | 'revizie_gaz' | 'extinctor' | 'altele'
  name: string
  subject: string | null
  dueDate: string
  intervalMonths: number | null
  leadDays: number[]
  notes: string | null
  isActive: boolean
  createdAt: string
}

export interface ExportFoodMonth {
  monthKey: string
  /** The family's month, not the user's own. */
  shared: boolean
  periodStart: string
  planFrom: string
  createdAt: string
  sources: ExportFoodSource[]
}

export interface ExportFoodSource {
  name: string
  amountBani: number
  createdAt: string
  purchases: ExportPurchase[]
}

export interface ExportPurchase {
  merchant: string
  amountBani: number
  spentOn: string
  note: string | null
  createdAt: string
}

export interface ExportCalendarDay {
  date: string
  kind: 'off' | 'working'
  note: string | null
}

// ── Reading a file back ──────────────────────────────────────────────────────
//
// Each field has the rules the API has for it, and each list the limits an
// account has (lib/limits.ts), so a file the app could not have made is
// refused whole.

const text = (max: number) => z.string().trim().min(1).max(max)
// Empty after trimming means none.
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((value) => value || null)
const monthKey = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)
const foodMonthKey = z.string().regex(/^(202[4-9]|20[3-9]\d)-(0[1-9]|1[0-2])$/)
const year = (date: string) => Number(date.slice(0, 4))
const date = z.iso.date()
const createdAt = z.iso.datetime()
// The last instalment's month must still have a four-digit year.
const monthIndex = (key: string) => year(key) * 12 + Number(key.slice(5, 7)) - 1
const LAST_MONTH = 9999 * 12 + 11

const entry = z.object({
  description: text(512),
  type: z.enum(['income', 'expense']),
  amountBani: z.number().int().min(0).max(999_999_999_900),
  paymentDate: date.nullable(),
  installment: z.object({ plan: z.number().int().min(0), index: z.number().int().min(1).max(360) }).nullable(),
  createdAt,
})

const category = z.object({ name: text(256), entries: z.array(entry).max(LIMITS.entriesPerMonth) })

/** A month's categories: names unique, entries within the month's limit. */
const categories = z
  .array(category)
  .max(LIMITS.categoriesPerMonth)
  .refine((list) => new Set(list.map((c) => c.name)).size === list.length, 'Two categories have the same name.')
  .refine((list) => list.reduce((sum, c) => sum + c.entries.length, 0) <= LIMITS.entriesPerMonth, 'Too many entries.')

// A template entry has no payment date and is no instalment.
const templateCategories = categories.refine(
  (list) => list.every((c) => c.entries.every((e) => e.paymentDate === null && e.installment === null)),
  'A template entry has no payment date and belongs to no plan.',
)

const plan = z
  .object({
    name: text(256),
    installmentCount: z.number().int().min(1).max(360),
    totalBani: z.number().int().min(1).max(999_999_999_900),
    firstMonthKey: monthKey,
    categoryName: text(256),
    purchaseDate: date.nullable(),
    closedAt: createdAt.nullable(),
    createdAt,
  })
  .refine((p) => monthIndex(p.firstMonthKey) + p.installmentCount - 1 <= LAST_MONTH)

const reminder = z.object({
  kind: z.enum(REMINDER_KINDS),
  name: text(256),
  subject: text(128).nullable(),
  dueDate: date.refine((d) => year(d) >= 2000 && year(d) <= LAST_REMINDER_YEAR),
  intervalMonths: z.number().int().min(1).max(120).nullable(),
  // Sorted and unique, as the app keeps them.
  leadDays: z
    .array(z.number().int().min(0).max(365))
    .min(1)
    .max(5)
    .transform((days) => [...new Set(days)].sort((a, b) => a - b)),
  notes: text(512).nullable(),
  isActive: z.boolean(),
  createdAt,
})

const purchase = z.object({
  // Trimmed, with runs of spaces made one.
  merchant: z
    .string()
    .transform((value) => value.trim().replace(/\s+/g, ' '))
    .pipe(z.string().min(1).max(64)),
  amountBani: z.number().int().min(1).max(10_000_000),
  spentOn: date,
  note: optionalText(256),
  createdAt,
})

const foodMonth = z.object({
  monthKey: foodMonthKey,
  shared: z.boolean(),
  periodStart: date,
  planFrom: date,
  createdAt,
  sources: z
    .array(
      z.object({
        name: text(64),
        amountBani: z.number().int().min(0).max(100_000_000),
        createdAt,
        purchases: z.array(purchase).max(LIMITS.foodPurchasesPerMonth),
      }),
    )
    .min(1)
    .max(MAX_SOURCES)
    .refine((list) => new Set(list.map((s) => sameName(s.name))).size === list.length, 'Two sources have the same name.')
    .refine(
      (list) => list.reduce((sum, s) => sum + s.purchases.length, 0) <= LIMITS.foodPurchasesPerMonth,
      'Too many purchases.',
    ),
})

const calendarDay = z.object({
  date: date.refine((d) => year(d) >= FIRST_CALENDAR_YEAR && year(d) <= LAST_CALENDAR_YEAR),
  kind: z.enum(['off', 'working']),
  note: optionalText(64),
})

const unique = <T>(list: T[], key: (item: T) => string) => new Set(list.map(key)).size === list.length

const exportFile: z.ZodType<ExportFile> = z
  .object({
    format: z.literal(EXPORT_FORMAT),
    version: z.literal(EXPORT_VERSION),
    exportedAt: createdAt,
    account: z.object({
      displayName: text(256),
      foodPeriodRule: z.enum(['calendar', 'working_day']),
      foodPaydayWorkingDay: z.number().int().min(1).max(10),
    }),
    template: z.object({ categories: templateCategories }).nullable(),
    months: z
      .array(z.object({ monthKey, createdAt, categories }))
      .max(LIMITS.months)
      .refine((list) => unique(list, (m) => m.monthKey), 'Two months have the same key.'),
    plans: z.array(plan).max(LIMITS.plans),
    reminders: z.array(reminder).max(LIMITS.reminders),
    food: z.object({
      // One personal month and one shared month at most for each key.
      months: z.array(foodMonth).refine((list) => unique(list, (m) => `${m.monthKey} ${String(m.shared)}`)),
      calendar: z
        .array(calendarDay)
        .max(LIMITS.calendarDays)
        .refine((list) => unique(list, (d) => d.date), 'Two corrections for the same day.'),
    }),
  })
  .superRefine((file, ctx) => {
    // An instalment is an expense in its plan's month for its index, once.
    const seen = new Set<string>()
    file.months.forEach((month, m) => {
      month.categories.forEach((cat, c) => {
        cat.entries.forEach((e, i) => {
          if (!e.installment) return
          const { plan: position, index } = e.installment
          const owner = file.plans[position]
          const key = `${String(position)} ${String(index)}`
          if (
            !owner ||
            e.type !== 'expense' ||
            index > owner.installmentCount ||
            addMonths(owner.firstMonthKey, index - 1) !== month.monthKey ||
            seen.has(key)
          ) {
            ctx.addIssue({ code: 'custom', path: ['months', m, 'categories', c, 'entries', i, 'installment'], message: '' })
          }
          seen.add(key)
        })
      })
    })
  })

// How to bring a file of each older version up to the next one. Empty while
// there is only version 1; a file of version N goes through UPGRADES[N],
// UPGRADES[N + 1] and so on.
const UPGRADES: Record<number, (file: Record<string, unknown>) => Record<string, unknown>> = {}

const header = z.object({ format: z.literal(EXPORT_FORMAT), version: z.number().int().min(1) })

/** Reads an uploaded file: refuses one from a newer version, upgrades an
    older one, and checks every field. */
export function parseExport(value: unknown): ExportFile {
  const found = header.safeParse(value)
  if (!found.success) throw badRequest('invalid_export', 'This is not an Adun export file.')
  if (found.data.version > EXPORT_VERSION) {
    throw badRequest('export_too_new', 'This file comes from a newer version of Adun.')
  }
  let file = value as Record<string, unknown>
  for (let version = found.data.version; version < EXPORT_VERSION; version++) {
    const upgrade = UPGRADES[version]
    if (!upgrade) throw badRequest('invalid_export', 'This is not an Adun export file.')
    file = { ...upgrade(file), version: version + 1 }
  }
  const result = exportFile.safeParse(file)
  if (result.success) return result.data
  const path = result.error.issues[0]?.path.join('.')
  throw badRequest('invalid_export', path ? `Invalid value in the file: ${path}.` : 'Invalid file.')
}
