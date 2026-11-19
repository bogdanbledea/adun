/* The export file: everything a user keeps in the app, to save as a backup
   and bring back into an empty account, here or on another server.

   - The version is the file's own, not the database's: it changes only when
     the file's shape does. An import upgrades an older file step by step.
   - Rows are nested (a month holds its categories, a category its entries),
     so the file carries no IDs. An instalment names its plan by the plan's
     position in `plans`. Lists are in the order the app shows them.
   - Amounts are whole bani, dates YYYY-MM-DD, times ISO in UTC. */

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
