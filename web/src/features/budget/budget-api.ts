import { api } from '../../lib/api.ts'

/* The budget endpoints. Amounts are whole bani (1 leu = 100 bani) both ways;
   money.ts turns them into text and back. */

export type EntryType = 'income' | 'expense'

export interface Entry {
  id: string
  description: string
  type: EntryType
  amountBani: number
}

export interface Category {
  id: string
  name: string
  entries: Entry[]
}

export interface Totals {
  incomeBani: number
  expenseBani: number
  balanceBani: number
}

export interface Month {
  monthKey: string
  categories: Category[]
  totals: Totals
}

export interface EntryFields {
  monthKey: string
  categoryName: string
  description: string
  type: EntryType
  amountBani: number
}

/** An entry as answered after a change. */
export interface SavedEntry extends Entry {
  monthKey: string
  categoryName: string
}

export const budgetApi = {
  months: (signal?: AbortSignal) => api<string[]>('/api/months', { signal }),
  month: (monthKey: string, signal?: AbortSignal) => api<Month>(`/api/months/${monthKey}`, { signal }),
  createMonth: (monthKey: string) => api<Month>('/api/months', { method: 'POST', body: { monthKey } }),
  deleteMonth: (monthKey: string) => api(`/api/months/${monthKey}`, { method: 'DELETE' }),
  addEntry: (fields: EntryFields) => api<SavedEntry>('/api/entries', { method: 'POST', body: fields }),
  updateEntry: (id: string, fields: Partial<EntryFields>) =>
    api<SavedEntry>(`/api/entries/${id}`, { method: 'PATCH', body: fields }),
  deleteEntry: (id: string) => api(`/api/entries/${id}`, { method: 'DELETE' }),
  // Whole lists in their new order: a month's categories, a category's entries.
  reorderCategories: (ids: string[]) => api('/api/categories/order', { method: 'PUT', body: { ids } }),
  reorderEntries: (ids: string[]) => api('/api/entries/order', { method: 'PUT', body: { ids } }),
}

/** What a category adds up to: its income less its expenses. */
export function categoryTotal(category: Category): number {
  return category.entries.reduce((sum, entry) => sum + (entry.type === 'income' ? entry.amountBani : -entry.amountBani), 0)
}
