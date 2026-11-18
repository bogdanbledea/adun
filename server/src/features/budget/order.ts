import { transaction, type Database } from '../../db.ts'
import { conflict, notFound } from '../../http/errors.ts'
import * as repo from './repository.ts'
import { entryNotFound } from './service.ts'

/* Reordering a month's categories, or a category's entries. Each takes the
   whole list in the new order; a list that is no longer that whole list
   (something was added or removed meanwhile) is refused, so the client
   reloads instead of saving a partial order. The template's are reordered
   the same way. */

const categoryNotFound = () => notFound('category_not_found', 'Category not found.')
const orderChanged = () => conflict('order_changed', 'The list has changed since it was loaded. Reload and try again.')

// The IDs have no duplicates (the routes check), so equal sizes and inclusion mean the same set.
const sameIds = (ids: string[], current: string[]) =>
  ids.length === current.length && current.every((id) => ids.includes(id))

/** `ids`: every category of one month, in the new order. */
export function reorderCategories(db: Database, userId: string, ids: string[]): void {
  transaction(db, () => {
    const first = repo.findCategory(db, userId, ids[0] as string)
    if (!first) throw categoryNotFound()
    const current = repo.listCategories(db, userId, first.monthId).map((category) => category.id)
    if (!sameIds(ids, current)) {
      if (ids.some((id) => !repo.findCategory(db, userId, id))) throw categoryNotFound()
      throw orderChanged()
    }
    for (const [i, id] of ids.entries()) repo.setCategoryOrder(db, userId, id, i)
  })
}

/** `ids`: every entry of one category, in the new order. */
export function reorderEntries(db: Database, userId: string, ids: string[]): void {
  transaction(db, () => {
    const first = repo.findEntry(db, userId, ids[0] as string)
    if (!first) throw entryNotFound()
    const current = repo
      .listEntries(db, userId, first.monthId)
      .filter((entry) => entry.categoryId === first.categoryId)
      .map((entry) => entry.id)
    if (!sameIds(ids, current)) {
      if (ids.some((id) => !repo.findEntry(db, userId, id))) throw entryNotFound()
      throw orderChanged()
    }
    for (const [i, id] of ids.entries()) repo.setEntryOrder(db, userId, id, i)
  })
}
