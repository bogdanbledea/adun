import { api } from '../../lib/api.ts'
import { todayDate } from '../budget/month-key.ts'

/* The reminder endpoints. Renewing names the browser's date, which a
   repeating reminder is moved past. */

export const REMINDER_KINDS = ['itp', 'rca', 'casco', 'rovinieta', 'revizie_gaz', 'extinctor', 'altele'] as const

export type ReminderKind = (typeof REMINDER_KINDS)[number]

export interface Reminder {
  id: string
  kind: ReminderKind
  name: string
  subject: string | null
  dueDate: string
  intervalMonths: number | null
  leadDays: number[]
  notes: string | null
  isActive: boolean
  createdAt: string
}

export interface ReminderInput {
  kind: ReminderKind
  name: string
  subject: string | null
  dueDate: string
  intervalMonths: number | null
  leadDays: number[]
  notes: string | null
}

export const remindersApi = {
  list: (signal?: AbortSignal) => api<Reminder[]>('/api/reminders', { signal }),
  create: (input: ReminderInput) => api<Reminder>('/api/reminders', { method: 'POST', body: input }),
  update: (id: string, changes: Partial<ReminderInput> & { isActive?: boolean }) =>
    api<Reminder>(`/api/reminders/${id}`, { method: 'PATCH', body: changes }),
  /** Without a date, a repeating reminder moves on by its interval. */
  renew: (id: string, dueDate: string | null) =>
    api<Reminder>(`/api/reminders/${id}/renew?today=${todayDate()}`, {
      method: 'POST',
      body: dueDate ? { dueDate } : {},
    }),
  remove: (id: string) => api(`/api/reminders/${id}`, { method: 'DELETE' }),
}
