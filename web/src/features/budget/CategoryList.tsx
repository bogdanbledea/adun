import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Plus, TrendingDown, TrendingUp } from 'lucide-react'
import { useT } from '../../lib/i18n.tsx'
import { IconButton } from '../../ui/Button.tsx'
import { cx } from '../../ui/cx.ts'
import { Money } from '../../ui/Money.tsx'
import { categoryTotal, type Category, type Entry } from './budget-api.ts'
import { DRAG_HANDLE, EntryRow } from './EntryRow.tsx'

/* The month's categories with their entries, each category headed by what
   its entries add up to and a button to add to it. The filter hides the
   entries of the other type, and a category left with none.

   Categories drag within the month, entries within their category, by
   pointer, touch (press and hold) or keyboard (Space on a handle, arrows,
   Space to drop, Escape to cancel). Each category's entries have their own
   drag context: in one shared context the keyboard would step from a
   category onto its own entries and never reach the next category. The
   parent receives the new order and saves it. */

export type Filter = 'all' | 'income' | 'expense'

interface CategoryListProps {
  categories: Category[]
  filter: Filter
  onReorderCategories: (next: Category[]) => void
  onReorderEntries: (categoryId: string, next: Entry[]) => void
  onAdd: (categoryName: string) => void
  onEdit: (entry: Entry, categoryName: string) => void
  onDelete: (entry: Entry) => void
}

function useReorderSensors() {
  return useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
}

/** What a screen reader hears while something is dragged, in the current language. */
function useAnnouncements(nameOf: (id: UniqueIdentifier) => string) {
  const t = useT()
  const announcements: Announcements = {
    onDragStart: ({ active }) => t('budget.dragStart', { name: nameOf(active.id) }),
    onDragOver: ({ active, over }) =>
      over ? t('budget.dragOver', { name: nameOf(active.id), over: nameOf(over.id) }) : undefined,
    onDragEnd: ({ active }) => t('budget.dragEnd', { name: nameOf(active.id) }),
    onDragCancel: ({ active }) => t('budget.dragCancel', { name: nameOf(active.id) }),
  }
  return { announcements, screenReaderInstructions: { draggable: t('budget.dragInstructions') } }
}

/** The new order after dropping `active` on `over`, or null when nothing moved. */
function moved<T extends { id: string }>(items: T[], { active, over }: DragEndEvent): T[] | null {
  if (!over || active.id === over.id) return null
  const from = items.findIndex((item) => item.id === active.id)
  const to = items.findIndex((item) => item.id === over.id)
  return from === -1 || to === -1 ? null : arrayMove(items, from, to)
}

export function CategoryList({ categories, filter, onReorderCategories, onReorderEntries, ...handlers }: CategoryListProps) {
  const sensors = useReorderSensors()
  const accessibility = useAnnouncements((id) => categories.find((category) => category.id === id)?.name ?? '')
  const shown = categories
    .map((category) => ({
      category,
      entries: filter === 'all' ? category.entries : category.entries.filter((entry) => entry.type === filter),
    }))
    .filter(({ entries }) => entries.length > 0)

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={(event) => {
        const next = moved(categories, event)
        if (next) onReorderCategories(next)
      }}
      accessibility={accessibility}
    >
      <SortableContext items={shown.map(({ category }) => category.id)} strategy={verticalListSortingStrategy}>
        <ul className="divide-y divide-line">
          {shown.map(({ category, entries }) => (
            <CategoryBlock
              key={category.id}
              category={category}
              entries={entries}
              onReorder={(next) => { onReorderEntries(category.id, next) }}
              {...handlers}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  )
}

interface CategoryBlockProps {
  category: Category
  /** The entries shown (the filter may hide some). */
  entries: Entry[]
  onReorder: (next: Entry[]) => void
  onAdd: (categoryName: string) => void
  onEdit: (entry: Entry, categoryName: string) => void
  onDelete: (entry: Entry) => void
}

function CategoryBlock({ category, entries, onReorder, onAdd, onEdit, onDelete }: CategoryBlockProps) {
  const t = useT()
  const sensors = useReorderSensors()
  const accessibility = useAnnouncements((id) => category.entries.find((entry) => entry.id === id)?.description ?? '')
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: category.id,
  })
  const expense = entries[0]?.type === 'expense'
  const Icon = expense ? TrendingDown : TrendingUp

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cx('px-2 py-3 sm:px-3', isDragging && 'relative z-10 bg-paper opacity-80')}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <button
            ref={setActivatorNodeRef}
            type="button"
            {...attributes}
            {...listeners}
            aria-label={t('budget.reorderCategory', { name: category.name })}
            className={DRAG_HANDLE}
          >
            <GripVertical />
          </button>
          <Icon aria-hidden="true" className={cx('size-4 shrink-0', expense ? 'text-expense' : 'text-income')} />
          <h3 className="truncate text-base font-semibold">{category.name}</h3>
          <span className="shrink-0 text-xs text-muted tabular-nums">{entries.length}</span>
        </div>
        <div className="flex shrink-0 items-center">
          <Money bani={categoryTotal({ ...category, entries })} tone="auto" signed className="font-display font-semibold" />
          <IconButton label={t('budget.addToCategory', { name: category.name })} onClick={() => { onAdd(category.name) }}>
            <Plus />
          </IconButton>
        </div>
      </div>
      {/* Reordering applies to all the category's entries, shown or filtered out. */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={(event) => {
          const next = moved(category.entries, event)
          if (next) onReorder(next)
        }}
        accessibility={accessibility}
      >
        <SortableContext items={entries.map((entry) => entry.id)} strategy={verticalListSortingStrategy}>
          <ul className="mt-1 pl-1">
            {entries.map((entry) => (
              <EntryRow
                key={entry.id}
                entry={entry}
                onEdit={(entry) => { onEdit(entry, category.name) }}
                onDelete={onDelete}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </li>
  )
}
