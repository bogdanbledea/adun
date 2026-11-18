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

const month = () => `month=${currentMonthKey()}`

export const plansApi = {
  list: (signal?: AbortSignal) => api<Plan[]>(`/api/plans?${month()}`, { signal }),
  get: (id: string, signal?: AbortSignal) => api<PlanDetail>(`/api/plans/${id}?${month()}`, { signal }),
}
