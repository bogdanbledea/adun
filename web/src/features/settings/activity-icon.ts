import { Activity, Calendar, Copy, CreditCard, Pencil, Plus, Trash2, Users, type LucideIcon } from 'lucide-react'

/* The icon beside an entry in the activity history, from the kind of action.
   The first rule that matches wins, so a deleted plan shows a bin, not a card. */

export function activityIcon(action: string, metadata: Record<string, unknown> | null): LucideIcon {
  if (/(deleted|cleared|closed)$/.test(action) || action === 'family.left' || action === 'family.dissolved') return Trash2
  if (/(updated|renamed)$/.test(action)) return Pencil
  // A month started from another one or from the template was copied.
  if (action === 'month.imported' || (action === 'month.created' && metadata?.from != null)) return Copy
  if (action.startsWith('family.') || action.startsWith('food.share')) return Users
  if (action.startsWith('plan.')) return CreditCard
  if (/(created|added)$/.test(action)) return Plus
  if (/^(month|calendar|reminder)\./.test(action)) return Calendar
  return Activity
}
