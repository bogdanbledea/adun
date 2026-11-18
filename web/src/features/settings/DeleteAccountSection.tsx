import { useState, type SubmitEvent } from 'react'
import { api, errorText } from '../../lib/api.ts'
import { useAuth } from '../../lib/auth.tsx'
import { useT } from '../../lib/i18n.tsx'
import { Button } from '../../ui/Button.tsx'
import { Notice } from '../../ui/Notice.tsx'
import { PasswordField } from '../auth/PasswordField.tsx'
import { SettingsSection } from './SettingsSection.tsx'

/* Deleting the account asks for the password right before: the server wants
   it confirmed on this session (POST /api/auth/confirm-password) within the
   last five minutes, and the deletion follows at once. */

type Status = { kind: 'closed' } | { kind: 'open' } | { kind: 'deleting' } | { kind: 'failed'; error: unknown }

export function DeleteAccountSection() {
  const t = useT()
  const { signOut } = useAuth()
  const [status, setStatus] = useState<Status>({ kind: 'closed' })
  const [password, setPassword] = useState('')

  const close = () => {
    setPassword('')
    setStatus({ kind: 'closed' })
  }

  const submit = async (event: SubmitEvent) => {
    event.preventDefault()
    setStatus({ kind: 'deleting' })
    try {
      await api('/api/auth/confirm-password', { method: 'POST', body: { password } })
      await api('/api/user', { method: 'DELETE' })
    } catch (error) {
      setStatus({ kind: 'failed', error })
      return
    }
    // The server already ended the session; this drops everything held here.
    await signOut()
  }

  return (
    <SettingsSection title={t('settings.deleteTitle')}>
      <div className="flex max-w-xl flex-col gap-3">
        <p className="text-sm text-muted">{t('settings.deleteText')}</p>
        {status.kind === 'closed' ? (
          <div>
            <Button variant="secondary" onClick={() => { setStatus({ kind: 'open' }) }}>
              {t('settings.deleteAccount')}
            </Button>
          </div>
        ) : (
          <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
            <PasswordField
              label={t('settings.deletePassword')}
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => { setPassword(event.target.value) }}
            />
            {status.kind === 'failed' && <Notice tone="error">{errorText(status.error, t)}</Notice>}
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="quiet" disabled={status.kind === 'deleting'} onClick={close}>
                {t('settings.cancel')}
              </Button>
              <Button type="submit" variant="danger" disabled={status.kind === 'deleting'}>
                {status.kind === 'deleting' ? t('settings.deleting') : t('settings.deleteForever')}
              </Button>
            </div>
          </form>
        )}
      </div>
    </SettingsSection>
  )
}
