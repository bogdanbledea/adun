import { useState, type SubmitEvent } from 'react'
import { api, errorText } from '../../lib/api.ts'
import { useI18n, type MessageKey } from '../../lib/i18n.tsx'
import { passwordProblem } from '../../lib/password.ts'
import { Button } from '../../ui/Button.tsx'
import { Dialog } from '../../ui/Dialog.tsx'
import { Notice } from '../../ui/Notice.tsx'
import { PasswordField } from '../auth/PasswordField.tsx'

/* The server checks the current password (a wrong one counts towards the
   lockout) and ends every other session of the account. */

interface Problems {
  next?: MessageKey
  confirm?: MessageKey
}

export function ChangePasswordDialog({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const { t, language } = useI18n()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [problems, setProblems] = useState<Problems>({})
  const [failure, setFailure] = useState<{ error: unknown } | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (event: SubmitEvent) => {
    event.preventDefault()
    setFailure(null)
    const found: Problems = {
      next: passwordProblem(next) ?? undefined,
      confirm: next !== confirm ? 'auth.passwordsMismatch' : undefined,
    }
    setProblems(found)
    if (found.next || found.confirm) return

    setBusy(true)
    try {
      // The language goes along so the email about the change is written in it.
      await api('/api/auth/change-password', { method: 'POST', body: { currentPassword: current, newPassword: next, language } })
      onChanged()
    } catch (error) {
      setFailure({ error })
      setBusy(false)
    }
  }

  return (
    <Dialog
      open
      onClose={() => { if (!busy) onClose() }}
      title={t('settings.changePassword')}
      footer={
        <>
          <Button variant="quiet" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="change-password-form" disabled={busy}>
            {busy ? t('common.saving') : t('settings.changePassword')}
          </Button>
        </>
      }
    >
      <form id="change-password-form" onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
        <p className="text-sm text-muted">{t('settings.changePasswordText')}</p>
        <PasswordField
          label={t('settings.currentPassword')}
          autoComplete="current-password"
          required
          value={current}
          onChange={(event) => { setCurrent(event.target.value) }}
        />
        <PasswordField
          label={t('auth.newPassword')}
          hint={t('auth.newPasswordHint')}
          autoComplete="new-password"
          required
          value={next}
          error={problems.next && t(problems.next)}
          onChange={(event) => { setNext(event.target.value) }}
        />
        <PasswordField
          label={t('auth.confirmPassword')}
          autoComplete="new-password"
          required
          value={confirm}
          error={problems.confirm && t(problems.confirm)}
          onChange={(event) => { setConfirm(event.target.value) }}
        />
        {failure && <Notice tone="error">{errorText(failure.error, t)}</Notice>}
      </form>
    </Dialog>
  )
}
