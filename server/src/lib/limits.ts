import { conflict } from '../http/errors.ts'

/* How much one account may store. Far above what a household uses; they exist
   so that no account, and no script signed in as one, can fill the disk. Each
   is checked inside the transaction that adds the rows, so a request that
   would pass a limit changes nothing. */

export const LIMITS = {
  /** Budget months per account (50 years). */
  months: 600,
  categoriesPerMonth: 200,
  entriesPerMonth: 500,
  /** Payment plans per account, closed ones included. */
  plans: 200,
  reminders: 200,
  foodPurchasesPerMonth: 2000,
  /** Working-calendar corrections per account. */
  calendarDays: 500,
  familyMembers: 20,
} as const

export const limitReached = () =>
  conflict('limit_reached', 'You have reached the maximum allowed. Delete some to add more.')
