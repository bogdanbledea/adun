import { CalendarClock, Car, FireExtinguisher, Flame, ShieldCheck, Ticket, type LucideIcon } from 'lucide-react'
import type { Translate } from '../../lib/i18n.tsx'
import type { Reminder, ReminderKind } from './reminders-api.ts'

/* What each kind looks like and the defaults it brings. ITP and RCA warn a
   month ahead, because a few days is not enough to book an appointment; the
   shorter ones are things bought online. */

export const KINDS: Record<ReminderKind, { Icon: LucideIcon; intervalMonths: number | null; leadDays: number[] }> = {
  itp: { Icon: Car, intervalMonths: 24, leadDays: [7, 30] },
  rca: { Icon: ShieldCheck, intervalMonths: 12, leadDays: [7, 30] },
  casco: { Icon: ShieldCheck, intervalMonths: 12, leadDays: [7, 30] },
  rovinieta: { Icon: Ticket, intervalMonths: 12, leadDays: [3, 7] },
  revizie_gaz: { Icon: Flame, intervalMonths: 24, leadDays: [7, 30] },
  extinctor: { Icon: FireExtinguisher, intervalMonths: 12, leadDays: [30] },
  altele: { Icon: CalendarClock, intervalMonths: null, leadDays: [3] },
}

/** Romanian puts "de" after 20 and up, unless the number ends in 01–19
    ("7 zile", "30 de zile", "101 zile"); the texts come in both forms. */
export const takesDe = (count: number) => count % 100 === 0 || count % 100 >= 20

const DAY_MS = 24 * 60 * 60 * 1000

/** Days from `today` to the due date; negative once it has passed. */
export function daysLeft(reminder: Reminder, today: string): number {
  return Math.round((Date.parse(reminder.dueDate) - Date.parse(today)) / DAY_MS)
}

export type Urgency = 'overdue' | 'soon' | 'ok' | 'inactive'

/** "soon" from the first lead time on, so the colour changes the day the first email goes. */
export function urgencyOf(reminder: Reminder, today: string): Urgency {
  if (!reminder.isActive) return 'inactive'
  const days = daysLeft(reminder, today)
  if (days < 0) return 'overdue'
  return days <= Math.max(0, ...reminder.leadDays) ? 'soon' : 'ok'
}

/** The countdown says the state outright: "Expiră azi", "În 12 zile". */
export function countdown(days: number, t: Translate): string {
  if (days < 0) {
    if (days === -1) return t('reminders.expiredYesterday')
    return t(takesDe(-days) ? 'reminders.expiredDaysDe' : 'reminders.expiredDays', { days: -days })
  }
  if (days === 0) return t('reminders.expiresToday')
  if (days === 1) return t('reminders.tomorrow')
  return t(takesDe(days) ? 'reminders.inDaysDe' : 'reminders.inDays', { days })
}
