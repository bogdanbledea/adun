import { api } from '../../lib/api.ts'
import { currentMonthKey } from '../budget/month-key.ts'

/* The payment plan endpoints. Amounts are whole bani. Each request names the
   browser's current month, which decides the instalments already paid. */

export interface Plan {
  id: string
  name: string
  installmentCount: number
  totalBani: number
  /** The regular instalment; the first may be a few bani more. */
  installmentBani: number
  firstMonthKey: string
  categoryName: string
  /** When the item was bought or the contract signed. */
  purchaseDate: string | null
  closedAt: string | null
  createdAt: string
  paidInstallments: number
  remainingInstallments: number
}

export interface Installment {
  id: string
  index: number
  monthKey: string
  amountBani: number
  paid: boolean
}

export interface PlanDetail extends Plan {
  installments: Installment[]
}

export interface NewPlan {
  name: string
  installmentCount: number
  totalBani: number
  firstMonthKey: string
  categoryName: string
  purchaseDate: string | null
}

export const MAX_INSTALLMENTS = 360

/** The first and the regular instalment, split as the server does: the
    first takes the remainder (200000 / 3 → 66668, then 66666). */
export function splitPreview(totalBani: number, count: number): { first: number; regular: number } {
  const regular = Math.floor(totalBani / count)
  return { first: totalBani - regular * (count - 1), regular }
}

const month = () => `month=${currentMonthKey()}`

export const plansApi = {
  list: (signal?: AbortSignal) => api<Plan[]>(`/api/plans?${month()}`, { signal }),
  get: (id: string, signal?: AbortSignal) => api<PlanDetail>(`/api/plans/${id}?${month()}`, { signal }),
  create: (plan: NewPlan) => api<Plan>(`/api/plans?${month()}`, { method: 'POST', body: plan }),
  setPurchaseDate: (id: string, purchaseDate: string | null) =>
    api<Plan>(`/api/plans/${id}?${month()}`, { method: 'PATCH', body: { purchaseDate } }),
  /** Deletes the instalments still to come and marks the plan closed. */
  close: (id: string) => api<Plan>(`/api/plans/${id}/close?${month()}`, { method: 'POST' }),
  /** Only a closed plan; every instalment goes with it. */
  remove: (id: string) => api(`/api/plans/${id}`, { method: 'DELETE' }),
}
