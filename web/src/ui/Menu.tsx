import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { cx } from './cx.ts'

/* A menu button (WAI-ARIA menu button pattern). The trigger opens a list of
   actions below it:

   - Enter, Space or ArrowDown on the trigger open it on the first item;
     ArrowUp opens it on the last.
   - Inside: ArrowDown/ArrowUp move (wrapping), Home/End jump, Enter or Space
     choose, Escape closes and returns focus to the trigger, Tab closes.
   - A click outside closes it. */

export type MenuEntry =
  | { label: string; icon?: ReactNode; onSelect: () => void; tone?: 'danger' }
  | 'separator'

interface MenuProps {
  /** Accessible name of the trigger. */
  label: string
  /** What the trigger shows (an icon, initials …). */
  trigger: ReactNode
  triggerClassName?: string
  items: MenuEntry[]
  align?: 'start' | 'end'
}

export function Menu({ label, trigger, triggerClassName, items, align = 'end' }: MenuProps) {
  const [open, setOpen] = useState(false)
  const [initialFocus, setInitialFocus] = useState<'first' | 'last'>('first')
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const menuId = useId()

  const menuItems = () => Array.from(listRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])

  useEffect(() => {
    if (!open) return
    const all = menuItems()
    ;(initialFocus === 'first' ? all[0] : all.at(-1))?.focus()

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open, initialFocus])

  const openAt = (position: 'first' | 'last') => {
    setInitialFocus(position)
    setOpen(true)
  }

  const close = (returnFocus: boolean) => {
    setOpen(false)
    if (returnFocus) triggerRef.current?.focus()
  }

  const onTriggerKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      openAt('first')
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      openAt('last')
    }
  }

  const onListKeyDown = (event: KeyboardEvent) => {
    const all = menuItems()
    const index = all.indexOf(document.activeElement as HTMLElement)
    const moveTo = (next: number) => {
      event.preventDefault()
      all[(next + all.length) % all.length]?.focus()
    }
    switch (event.key) {
      case 'ArrowDown':
        moveTo(index + 1)
        break
      case 'ArrowUp':
        moveTo(index - 1)
        break
      case 'Home':
        moveTo(0)
        break
      case 'End':
        moveTo(all.length - 1)
        break
      case 'Escape':
        event.preventDefault()
        close(true)
        break
      case 'Tab':
        close(false)
        break
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => {
          if (open) close(false)
          else openAt('first')
        }}
        onKeyDown={onTriggerKeyDown}
        className={triggerClassName}
      >
        {trigger}
      </button>
      {open && (
        <div
          ref={listRef}
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onListKeyDown}
          className={cx(
            'absolute top-full z-50 mt-2 min-w-56 rounded-xl border border-line bg-paper p-1 shadow-lg',
            align === 'end' ? 'right-0' : 'left-0',
          )}
        >
          {items.map((item, index) =>
            item === 'separator' ? (
              <div key={`separator-${String(index)}`} role="separator" className="-mx-1 my-1 border-t border-line" />
            ) : (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                tabIndex={-1}
                onClick={() => {
                  close(true)
                  item.onSelect()
                }}
                className={cx(
                  'flex min-h-11 pointer-fine:min-h-9 w-full items-center gap-3 rounded-lg px-3 text-left text-sm transition-colors duration-150',
                  'hover:bg-hover focus-visible:bg-hover focus-visible:outline-offset-[-2px] [&_svg]:size-4 [&_svg]:shrink-0',
                  item.tone === 'danger' ? 'text-danger' : 'text-ink',
                )}
              >
                {item.icon}
                {item.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  )
}
