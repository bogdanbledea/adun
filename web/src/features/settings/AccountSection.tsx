import { useState, type SubmitEvent } from 'react'
import { api, errorText } from '../../lib/api.ts'
import { useAuth, type AuthUser } from '../../lib/auth.tsx'
import { useT } from '../../lib/i18n.tsx'
import { Button } from '../../ui/Button.tsx'
import { Field } from '../../ui/Field.tsx'
import { Notice } from '../../ui/Notice.tsx'
import { SettingsSection } from './SettingsSection.tsx'

/* The display name can change; the email address cannot. */

type Status = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved' } | { kind: 'failed'; error: unknown }

export function AccountSection({ user }: { user: AuthUser }) {
  const t = useT()
  const { signedIn } = useAuth()
  const [name, setName] = useState(user.displayName)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [empty, setEmpty] = useState(false)
  const changed = name.trim() !== user.displayName

  const edit = (value: string) => {
    setName(value)
    setEmpty(false)
    setStatus({ kind: 'idle' })
  }

  const save = async (event: SubmitEvent) => {
    event.preventDefault()
    if (!name.trim()) {
      setEmpty(true)
      return
    }
    setStatus({ kind: 'saving' })
    try {
      const updated = await api<AuthUser>('/api/user/me', { method: 'PATCH', body: { displayName: name.trim() } })
      // The header's initials follow.
      signedIn(updated)
      setName(updated.displayName)
      setStatus({ kind: 'saved' })
    } catch (error) {
      setStatus({ kind: 'failed', error })
    }
  }

  return (
    <SettingsSection title={t('settings.account')}>
      <form onSubmit={(event) => void save(event)} className="flex max-w-xl flex-col gap-4">
        <Field
          label={t('settings.displayName')}
          autoComplete="name"
          maxLength={256}
          value={name}
          error={empty ? t('settings.nameRequired') : undefined}
          onChange={(event) => { edit(event.target.value) }}
        />
        <Field label={t('auth.email')} type="email" value={user.email} readOnly hint={t('settings.emailFixed')} />
        {status.kind === 'saved' && <Notice tone="success">{t('settings.saved')}</Notice>}
        {status.kind === 'failed' && <Notice tone="error">{errorText(status.error, t)}</Notice>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="quiet" disabled={!changed || status.kind === 'saving'} onClick={() => { edit(user.displayName) }}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={!changed || status.kind === 'saving'}>
            {status.kind === 'saving' ? t('auth.saving') : t('settings.save')}
          </Button>
        </div>
      </form>
    </SettingsSection>
  )
}
