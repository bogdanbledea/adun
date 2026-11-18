import { X } from 'lucide-react'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { useT } from '../lib/i18n.tsx'
import { Button, IconButton } from './Button.tsx'
import { cx } from './cx.ts'

/* A modal on the native <dialog> element. showModal() makes the rest of the
   page inert and keeps Tab inside; Escape fires `cancel`, which becomes
   onClose so the parent stays the owner of `open`. Two things are done by
   hand because browsers differ on them: focus moves to the element marked
   data-autofocus, else the first control in the body, else the first footer
   button, and returns to whatever had it before. A click on the backdrop
   also closes, but only when the press started there too, so dragging a
   text selection out of a field does not throw the form away. A dialog
   taller than the screen scrolls its body, with the title and the buttons
   staying in view. */

interface DialogProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  /** Buttons along the bottom edge. */
  footer?: ReactNode
}

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

export function Dialog({ open, onClose, title, children, footer }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const footerRef = useRef<HTMLElement>(null)
  const pressedOnBackdrop = useRef(false)
  const titleId = useId()
  const t = useT()

  useEffect(() => {
    const dialog = ref.current
    if (!open || !dialog) return
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialog.showModal()
    const first =
      dialog.querySelector<HTMLElement>('[data-autofocus]') ??
      bodyRef.current?.querySelector<HTMLElement>(FOCUSABLE) ??
      footerRef.current?.querySelector<HTMLElement>(FOCUSABLE)
    first?.focus()
    return () => {
      dialog.close()
      opener?.focus()
    }
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onPointerDown={(event) => {
        pressedOnBackdrop.current = event.target === event.currentTarget
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && pressedOnBackdrop.current) onClose()
        pressedOnBackdrop.current = false
      }}
      className={cx(
        'max-h-[calc(100dvh-2rem)] overflow-hidden border-line bg-paper p-0 text-ink shadow-2xl',
        // A sheet along the bottom edge on phones, within reach of the thumb;
        // a centred card from sm up.
        'mx-0 mt-auto mb-0 w-full max-w-none rounded-t-2xl border-t',
        'sm:m-auto sm:w-[calc(100%-2rem)] sm:max-w-lg sm:rounded-2xl sm:border',
      )}
    >
      {open && (
        <div className="flex max-h-[calc(100dvh-2rem)] flex-col pb-[env(safe-area-inset-bottom)] sm:pb-0">
          <header className="flex shrink-0 items-center justify-between gap-3 border-b border-line py-2 pr-2 pl-5">
            <h2 id={titleId} className="text-lg font-semibold">
              {title}
            </h2>
            <IconButton label={t('common.close')} onClick={onClose}>
              <X />
            </IconButton>
          </header>
          <div ref={bodyRef} className="min-h-0 overflow-y-auto overscroll-contain px-5 py-5">
            {children}
          </div>
          {footer && (
            <footer
              ref={footerRef}
              className="flex shrink-0 flex-col-reverse gap-2 border-t border-line px-5 py-4 sm:flex-row sm:justify-end"
            >
              {footer}
            </footer>
          )}
        </div>
      )}
    </dialog>
  )
}

interface ConfirmDialogProps {
  open: boolean
  title: string
  children: ReactNode
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
  /** Destructive actions get the danger button. */
  destructive?: boolean
  /** While the action runs: buttons disabled. */
  busy?: boolean
}

export function ConfirmDialog({ open, title, children, confirmLabel, onConfirm, onCancel, destructive = false, busy = false }: ConfirmDialogProps) {
  const t = useT()
  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!busy) onCancel()
      }}
      title={title}
      footer={
        <>
          <Button variant="quiet" onClick={onCancel} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button variant={destructive ? 'danger' : 'primary'} onClick={onConfirm} disabled={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-muted">{children}</div>
    </Dialog>
  )
}
