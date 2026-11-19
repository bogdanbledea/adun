import { transaction, type Database } from '../../db.ts'
import { conflict, notFound } from '../../http/errors.ts'
import { logActivity } from '../activity/service.ts'
import { membershipOf } from '../family/repository.ts'
import { notInFamily } from '../family/service.ts'
import * as family from './family-repository.ts'
import * as repo from './repository.ts'

/* Sharing a member's personal food months with their family.
   - Sharing is a choice, and never merges two months. A personal month
     moves into the family as it is when the family has no budget for it;
     otherwise the two clash and wait for the user to choose.
   - The preview changes nothing. Sharing moves every month that does not
     clash, at once, and leaves the clashes alone.
   - A clash is settled one month at a time: keeping the family's deletes
     the personal month with its purchases; keeping one's own replaces the
     family's month, only while that has no purchases.
   - The same choice settles the months that stop the last member leaving
     (family/service.ts). */

export type Resolution = 'keep_mine' | 'keep_theirs'

function requireFamily(db: Database, userId: string): string {
  const membership = membershipOf(db, userId)
  if (!membership) throw notInFamily()
  return membership.familyId
}

export function sharePreview(db: Database, userId: string) {
  const familyId = requireFamily(db, userId)
  const personal = family.personalBudgets(db, userId)
  const theirs = new Map(
    family.familyBudgetsIn(db, familyId, personal.map((b) => b.monthKey)).map((b) => [b.monthKey, b]),
  )
  const clean = []
  const conflicts = []
  for (const mine of personal) {
    const other = theirs.get(mine.monthKey)
    const summary = family.budgetSummary(db, mine.id)
    if (other) conflicts.push({ monthKey: mine.monthKey, mine: summary, family: family.budgetSummary(db, other.id) })
    else clean.push({ monthKey: mine.monthKey, mine: summary })
  }
  return { clean, conflicts }
}

/** Moves every personal month that does not clash into the family. */
export function shareClean(db: Database, userId: string): { moved: string[]; skipped: string[] } {
  return transaction(db, () => {
    const familyId = requireFamily(db, userId)
    const personal = family.personalBudgets(db, userId)
    const taken = new Set(family.familyBudgetsIn(db, familyId, personal.map((b) => b.monthKey)).map((b) => b.monthKey))
    const toMove = personal.filter((b) => !taken.has(b.monthKey))
    const moved = toMove.map((b) => b.monthKey)
    const skipped = personal.filter((b) => taken.has(b.monthKey)).map((b) => b.monthKey)
    if (moved.length > 0) {
      family.shareBudgets(db, userId, familyId, toMove.map((b) => b.id))
      logActivity(db, userId, 'food.shared', { moved: moved.length, skipped: skipped.length })
    }
    return { moved, skipped }
  })
}

export function resolveClash(db: Database, userId: string, monthKey: string, resolution: Resolution) {
  return transaction(db, () => {
    const familyId = requireFamily(db, userId)
    const personalScope = { userId, familyId: null }
    const familyScope = { userId, familyId }
    const mine = repo.findBudget(db, personalScope, monthKey)
    const theirs = repo.findBudget(db, familyScope, monthKey)
    if (!mine || !theirs) throw notFound('food_no_clash', 'This month has nothing to settle.')

    if (resolution === 'keep_theirs') {
      repo.deleteBudget(db, personalScope, mine.id)
    } else {
      if (family.budgetSummary(db, theirs.id).purchaseCount > 0) {
        throw conflict(
          'food_family_month_has_purchases',
          'The family’s budget for this month has purchases. Delete them before replacing it.',
        )
      }
      repo.deleteBudget(db, familyScope, theirs.id)
      family.shareBudgets(db, userId, familyId, [mine.id])
    }
    logActivity(db, userId, 'food.share_resolved', { monthKey, resolution })
    return { monthKey, resolution }
  })
}
