import { useState, type SubmitEvent } from 'react'
import { api, errorText } from '../../lib/api.ts'
import { useT } from '../../lib/i18n.tsx'
import { Button } from '../../ui/Button.tsx'
import { Dialog } from '../../ui/Dialog.tsx'
import { Notice } from '../../ui/Notice.tsx'
import { PasswordField } from '../auth/PasswordField.tsx'

/* Asks for the password before a sensitive action (export, deleting the
   account): the server wants it confirmed on this session just before, and
   one confirmation allows one action. `action` runs right after; a failure
   of either stays in the dialog. */

interface PasswordDialogProps<T> {
  action: () => Promise<T>
  busyLabel: string
  onDone: (result: T) => void
  onClose: () => void
}

export function PasswordDialog<T>({ action, busyLabel, onDone, onClose }: PasswordDialogProps<T>) {
  const t = useT()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<{ error: unknown } | null>(null)

  const submit = async (event: SubmitEvent) => {
    event.preventDefault()
    setFailure(null)
    setBusy(true)
    try {
      await api('/api/auth/confirm-password', { method: 'POST', body: { password } })
      onDone(await action())
    } catch (error) {
      setFailure({ error })
      setBusy(false)
    }
  }

  return (
    <Dialog
      open
      onClose={() => { if (!busy) onClose() }}
      title={t('settings.confirmTitle')}
      footer={
        <>
          <Button variant="quiet" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="confirm-password" disabled={busy}>
            {busy ? busyLabel : t('settings.confirm')}
          </Button>
        </>
      }
    >
      <form id="confirm-password" onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
        <p className="text-sm text-muted">{t('settings.confirmText')}</p>
        <PasswordField
          label={t('auth.password')}
          autoComplete="current-password"
          required
          data-autofocus
          value={password}
          onChange={(event) => { setPassword(event.target.value) }}
        />
        {failure && <Notice tone="error">{errorText(failure.error, t)}</Notice>}
      </form>
    </Dialog>
  )
}
