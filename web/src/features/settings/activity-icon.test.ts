import { Activity, Calendar, Copy, CreditCard, Pencil, Plus, Trash2, Users } from 'lucide-react'
import { expect, test } from 'vitest'
import { activityIcon } from './activity-icon.ts'

test('anything removed shows a bin', () => {
  for (const action of ['entry.deleted', 'month.deleted', 'month.cleared', 'plan.closed', 'food.purchases_cleared', 'family.left', 'family.dissolved']) {
    expect(activityIcon(action, null)).toBe(Trash2)
  }
})

test('a change shows a pencil', () => {
  expect(activityIcon('reminder.updated', null)).toBe(Pencil)
  expect(activityIcon('food.purchase_updated', null)).toBe(Pencil)
  expect(activityIcon('family.renamed', null)).toBe(Pencil)
})

test('a month copied from another or from the template shows a copy, a new empty one a plus', () => {
  expect(activityIcon('month.created', { monthKey: '2026-12', from: 'template' })).toBe(Copy)
  expect(activityIcon('month.imported', { monthKey: '2026-12', from: '2026-11' })).toBe(Copy)
  expect(activityIcon('month.created', { monthKey: '2026-12' })).toBe(Plus)
})

test('family, plans, additions and dates each have their own', () => {
  expect(activityIcon('family.joined', null)).toBe(Users)
  expect(activityIcon('food.shared', null)).toBe(Users)
  expect(activityIcon('plan.created', null)).toBe(CreditCard)
  expect(activityIcon('entry.created', null)).toBe(Plus)
  expect(activityIcon('food.purchase_added', null)).toBe(Plus)
  expect(activityIcon('calendar.day_set', null)).toBe(Calendar)
  expect(activityIcon('reminder.renewed', null)).toBe(Calendar)
})

test('anything else shows the general one', () => {
  expect(activityIcon('account.password_changed', null)).toBe(Activity)
  expect(activityIcon('data.exported', null)).toBe(Activity)
})
