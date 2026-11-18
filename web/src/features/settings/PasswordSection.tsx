import { useState, type SubmitEvent } from 'react'
import { api, errorText } from '../../lib/api.ts'
import { useI18n, type MessageKey } from '../../lib/i18n.tsx'
import { passwordProblem } from '../../lib/password.ts'
import { Button } from '../../ui/Button.tsx'
import { Notice } from '../../ui/Notice.tsx'
import { PasswordField } from '../auth/PasswordField.tsx'
import { SettingsSection } from './SettingsSection.tsx'

/* Changing the password needs the current one. The form stays closed until
   asked for, so the page does not open on three empty password fields. */

interface Problems {
  password?: MessageKey
  confirm?: MessageKey
}

type Status = { kind: 'closed' } | { kind: 'open' } | { kind: 'saving' } | { kind: 'changed' } | { kind: 'failed'; error: unknown }

export function PasswordSection() {
  const { t, language } = useI18n()
  const [status, setStatus] = useState<Status>({ kind: 'closed' })
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [problems, setProblems] = useState<Problems>({})

  const close = (next: Status) => {
    setCurrentPassword('')
    setNewPassword('')
    setConfirm('')
    setProblems({})
    setStatus(next)
  }

  const submit = async (event: SubmitEvent) => {
    event.preventDefault()
    const found: Problems = {
      password: passwordProblem(newPassword) ?? undefined,
      confirm: newPassword !== confirm ? 'auth.passwordsMismatch' : undefined,
    }
    setProblems(found)
    if (found.password || found.confirm) return

    setStatus({ kind: 'saving' })
    try {
      // The language goes along so the email about the change is written in it.
      await api('/api/auth/change-password', { method: 'POST', body: { currentPassword, newPassword, language } })
      close({ kind: 'changed' })
    } catch (error) {
      setStatus({ kind: 'failed', error })
    }
  }

  if (status.kind === 'closed' || status.kind === 'changed') {
    return (
      <SettingsSection title={t('settings.password')}>
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted">{t('settings.passwordText')}</p>
          {status.kind === 'changed' && <Notice tone="success">{t('settings.passwordChanged')}</Notice>}
          <div>
            <Button variant="secondary" onClick={() => { setStatus({ kind: 'open' }) }}>
              {t('settings.changePassword')}
            </Button>
          </div>
        </div>
      </SettingsSection>
    )
  }

  return (
    <SettingsSection title={t('settings.password')}>
      <form onSubmit={(event) => void submit(event)} className="flex max-w-xl flex-col gap-4">
        <p className="text-sm text-muted">{t('settings.passwordText')}</p>
        <PasswordField
          label={t('settings.currentPassword')}
          autoComplete="current-password"
          required
          value={currentPassword}
          onChange={(event) => { setCurrentPassword(event.target.value) }}
        />
        <PasswordField
          label={t('auth.newPassword')}
          hint={t('auth.newPasswordHint')}
          autoComplete="new-password"
          required
          value={newPassword}
          error={problems.password && t(problems.password)}
          onChange={(event) => { setNewPassword(event.target.value) }}
        />
        <PasswordField
          label={t('auth.confirmPassword')}
          autoComplete="new-password"
          required
          value={confirm}
          error={problems.confirm && t(problems.confirm)}
          onChange={(event) => { setConfirm(event.target.value) }}
        />
        {status.kind === 'failed' && <Notice tone="error">{errorText(status.error, t)}</Notice>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="quiet" disabled={status.kind === 'saving'} onClick={() => { close({ kind: 'closed' }) }}>
            {t('settings.cancel')}
          </Button>
          <Button type="submit" disabled={status.kind === 'saving'}>
            {status.kind === 'saving' ? t('auth.saving') : t('settings.changePassword')}
          </Button>
        </div>
      </form>
    </SettingsSection>
  )
}
