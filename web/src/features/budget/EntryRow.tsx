import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Pencil, Trash2 } from 'lucide-react'
import { useT } from '../../lib/i18n.tsx'
import { cx } from '../../ui/cx.ts'
import { Money } from '../../ui/Money.tsx'
import type { Entry } from './budget-api.ts'

/* One entry: drag handle, description, amount, edit and delete. A click
   anywhere on the row opens it for editing; keyboard users have the edit
   button. */

interface EntryRowProps {
  entry: Entry
  onEdit: (entry: Entry) => void
  onDelete: (entry: Entry) => void
}

export const DRAG_HANDLE =
  'grid size-9 shrink-0 cursor-grab touch-none place-items-center text-muted/60 hover:text-muted active:cursor-grabbing [&_svg]:size-4'

const ROW_BUTTON =
  'grid size-11 pointer-fine:size-8 place-items-center rounded-lg text-muted transition-colors duration-150 hover:bg-hover hover:text-ink [&_svg]:size-4'

export function EntryRow({ entry, onEdit, onDelete }: EntryRowProps) {
  const t = useT()
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: entry.id,
  })

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      onClick={() => { onEdit(entry) }}
      className={cx(
        'group flex min-h-11 pointer-fine:min-h-9 cursor-pointer items-center justify-between gap-2 border-t border-line py-1 pr-1 first:border-t-0 hover:bg-hover',
        isDragging && 'relative z-10 bg-paper opacity-70',
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <button
          ref={setActivatorNodeRef}
          type="button"
          {...attributes}
          {...listeners}
          onClick={(event) => { event.stopPropagation() }}
          aria-label={t('budget.reorderEntry', { name: entry.description })}
          className={DRAG_HANDLE}
        >
          <GripVertical />
        </button>
        <span className="min-w-0 flex-1 truncate">{entry.description}</span>
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        <Money bani={entry.amountBani} tone={entry.type} className="text-right font-semibold sm:min-w-24" />
        {/* Hidden until hover on pointer devices; always there on touch. */}
        <div className="flex [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:group-hover:opacity-100">
          <button
            type="button"
            aria-label={t('budget.editEntry', { name: entry.description })}
            title={t('budget.editEntry', { name: entry.description })}
            onClick={(event) => {
              event.stopPropagation()
              onEdit(entry)
            }}
            className={ROW_BUTTON}
          >
            <Pencil />
          </button>
          <button
            type="button"
            aria-label={t('budget.deleteEntryNamed', { name: entry.description })}
            title={t('budget.deleteEntryNamed', { name: entry.description })}
            onClick={(event) => {
              event.stopPropagation()
              onDelete(entry)
            }}
            className={cx(ROW_BUTTON, 'hover:text-danger')}
          >
            <Trash2 />
          </button>
        </div>
      </div>
    </li>
  )
}
