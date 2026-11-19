import { api } from '../../lib/api.ts'
import { todayDate } from '../budget/month-key.ts'

/* The food endpoints. Amounts are whole bani; dates are YYYY-MM-DD. The
   browser's date says which week is running and which month today's money
   belongs to. */

export interface FoodPeriod {
  start: string
  end: string
  /** Where the user's rule would start this month, for "back to the rule". */
  ruleStart: string
  rule: 'calendar' | 'working_day'
}

export interface FoodSource {
  id: string
  name: string
  amountBani: number
  spentBani: number
  remainingBani: number
}

export interface FoodWeek {
  index: number
  start: string
  end: string
  days: number
  allowanceBani: number
  spentBani: number
  remainingBani: number
  state: 'past' | 'current' | 'future'
  /** A later week whose allowance still depends on how this week ends. */
  estimated: boolean
  /** Entirely before the budget was set up. */
  beforeStart: boolean
}

export interface FoodCurrentWeek extends FoodWeek {
  daysElapsed: number
  daysLeft: number
  /** What should have been spent by the end of today. */
  paceBani: number
  perDayLeftBani: number
  status: 'ok' | 'behind' | 'over'
}

export interface FoodPurchase {
  id: string
  merchant: string
  amountBani: number
  spentOn: string
  note: string | null
  sourceId: string
  sourceName: string
  createdAt: string
  /** Who added it; null once their account is deleted. */
  addedBy: string | null
}

export interface PurchaseInput {
  merchant: string
  amountBani: number
  spentOn: string
  sourceId: string
  note: string | null
}

interface MonthCommon {
  monthKey: string
  period: FoodPeriod
  /** The family's month, shared by its members. */
  shared: boolean
}

export interface EmptyFoodMonth extends MonthCommon {
  exists: false
  suggestedFrom: string | null
  suggestedSources: { name: string; amountBani: number }[]
}

export interface FoodMonth extends MonthCommon {
  exists: true
  totalBani: number
  spentBani: number
  remainingBani: number
  sources: FoodSource[]
  weeks: FoodWeek[]
  currentWeek: FoodCurrentWeek | null
  merchants: { name: string; totalBani: number; count: number }[]
  purchases: FoodPurchase[]
}

export type FoodMonthData = EmptyFoodMonth | FoodMonth

export interface SourceInput {
  id?: string
  name: string
  amountBani: number
}

export type HolidayKey =
  | 'new_year'
  | 'epiphany'
  | 'st_john'
  | 'union_day'
  | 'good_friday'
  | 'easter'
  | 'labour_day'
  | 'children_day'
  | 'pentecost'
  | 'assumption'
  | 'st_andrew'
  | 'national_day'
  | 'christmas'

export interface CalendarDay {
  date: string
  holiday: HolidayKey | null
  legal: boolean
  override: 'off' | 'working' | null
  note: string | null
  isWorkingDay: boolean
}

export interface WorkCalendar {
  year: number
  rule: 'calendar' | 'working_day'
  paydayWorkingDay: number
  days: CalendarDay[]
  paydays: { monthKey: string; date: string }[]
}

const today = () => todayDate()

export const foodApi = {
  current: (signal?: AbortSignal) => api<{ monthKey: string }>(`/api/food/current?today=${today()}`, { signal }),
  month: (monthKey: string, signal?: AbortSignal) => api<FoodMonthData>(`/api/food/${monthKey}?today=${today()}`, { signal }),
  /** The month's sources as one list; `periodStart` only when it changes. */
  saveSources: (monthKey: string, sources: SourceInput[], periodStart?: string) =>
    api<FoodMonth>(`/api/food/${monthKey}/sources?today=${today()}`, { method: 'PUT', body: { sources, periodStart } }),
  deleteBudget: (monthKey: string) => api(`/api/food/${monthKey}`, { method: 'DELETE' }),
  clearPurchases: (monthKey: string) =>
    api<{ ok: true; deleted: number }>(`/api/food/${monthKey}/purchases`, { method: 'DELETE' }),
  addPurchase: (monthKey: string, input: PurchaseInput) =>
    api<FoodPurchase>(`/api/food/${monthKey}/purchases`, { method: 'POST', body: input }),
  updatePurchase: (id: string, input: PurchaseInput) =>
    api<FoodPurchase>(`/api/food/purchases/${id}`, { method: 'PATCH', body: input }),
  deletePurchase: (id: string) => api(`/api/food/purchases/${id}`, { method: 'DELETE' }),
  calendar: (year: number, signal?: AbortSignal) => api<WorkCalendar>(`/api/food/calendar/${String(year)}`, { signal }),
  setDay: (date: string, kind: 'off' | 'working', note: string | null = null) =>
    api(`/api/food/calendar/${date}`, { method: 'PUT', body: { kind, note } }),
  resetDay: (date: string) => api(`/api/food/calendar/${date}`, { method: 'DELETE' }),
}
