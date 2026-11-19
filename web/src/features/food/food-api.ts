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

const today = () => todayDate()

export const foodApi = {
  current: (signal?: AbortSignal) => api<{ monthKey: string }>(`/api/food/current?today=${today()}`, { signal }),
  month: (monthKey: string, signal?: AbortSignal) => api<FoodMonthData>(`/api/food/${monthKey}?today=${today()}`, { signal }),
  /** The month's sources as one list; `periodStart` only when it changes. */
  saveSources: (monthKey: string, sources: SourceInput[], periodStart?: string) =>
    api<FoodMonth>(`/api/food/${monthKey}/sources?today=${today()}`, { method: 'PUT', body: { sources, periodStart } }),
  addPurchase: (monthKey: string, input: PurchaseInput) =>
    api<FoodPurchase>(`/api/food/${monthKey}/purchases`, { method: 'POST', body: input }),
  updatePurchase: (id: string, input: PurchaseInput) =>
    api<FoodPurchase>(`/api/food/purchases/${id}`, { method: 'PATCH', body: input }),
  deletePurchase: (id: string) => api(`/api/food/purchases/${id}`, { method: 'DELETE' }),
}
