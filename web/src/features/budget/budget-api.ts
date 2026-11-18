import { api } from '../../lib/api.ts'

/* The budget endpoints. Amounts are whole bani (1 leu = 100 bani) both ways;
   money.ts turns them into text and back. */

export type EntryType = 'income' | 'expense'

export interface Entry {
  id: string
  description: string
  type: EntryType
  amountBani: number
  /** When it was actually paid; never in the template. */
  paymentDate: string | null
  /** Set on a payment plan's instalment: number `index` of `total`. */
  plan: { id: string; name: string; index: number; total: number } | null
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

/** Where a month's entries are copied from: another month's key, or 'template'. */
export type Source = string

/** Empty until its first entry. */
export interface Template {
  categories: Category[]
}

export interface EntryFields {
  monthKey: string
  categoryName: string
  description: string
  type: EntryType
  amountBani: number
  paymentDate?: string | null
}

/** An entry as answered after a change. */
export interface SavedEntry extends Entry {
  /** null: the template. */
  monthKey: string | null
  categoryName: string
}

export interface MonthDeletion {
  cleared: boolean
  keptInstallments: number
}

export const budgetApi = {
  months: (signal?: AbortSignal) => api<string[]>('/api/months', { signal }),
  month: (monthKey: string, signal?: AbortSignal) => api<Month>(`/api/months/${monthKey}`, { signal }),
  createMonth: (monthKey: string, from?: Source) => api<Month>('/api/months', { method: 'POST', body: { monthKey, from } }),
  importInto: (monthKey: string, from: Source) =>
    api<{ imported: number }>(`/api/months/${monthKey}/import`, { method: 'POST', body: { from } }),
  /** A month holding instalments is cleared instead: only its own entries go. */
  deleteMonth: (monthKey: string) => api<MonthDeletion>(`/api/months/${monthKey}`, { method: 'DELETE' }),
  addEntry: (fields: EntryFields) => api<SavedEntry>('/api/entries', { method: 'POST', body: fields }),
  updateEntry: (id: string, fields: Partial<EntryFields>) =>
    api<SavedEntry>(`/api/entries/${id}`, { method: 'PATCH', body: fields }),
  template: (signal?: AbortSignal) => api<Template>('/api/template', { signal }),
  addTemplateEntry: (fields: Omit<EntryFields, 'monthKey' | 'paymentDate'>) =>
    api<SavedEntry>('/api/template/entries', { method: 'POST', body: fields }),
  deleteEntry: (id: string) => api(`/api/entries/${id}`, { method: 'DELETE' }),
  // Whole lists in their new order: a month's categories, a category's entries.
  reorderCategories: (ids: string[]) => api('/api/categories/order', { method: 'PUT', body: { ids } }),
  reorderEntries: (ids: string[]) => api('/api/entries/order', { method: 'PUT', body: { ids } }),
}

/** What a category adds up to: its income less its expenses. */
export function categoryTotal(category: Category): number {
  return category.entries.reduce((sum, entry) => sum + (entry.type === 'income' ? entry.amountBani : -entry.amountBani), 0)
}
