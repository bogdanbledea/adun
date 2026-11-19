import { KeyRound, LogOut } from 'lucide-react'
import { useState } from 'react'
import { errorText } from '../../lib/api.ts'
import { useAuth } from '../../lib/auth.tsx'
import { useT } from '../../lib/i18n.tsx'
import { Button } from '../../ui/Button.tsx'
import { ConfirmDialog } from '../../ui/Dialog.tsx'
import { Notice } from '../../ui/Notice.tsx'
import { ChangePasswordDialog } from './ChangePasswordDialog.tsx'
import { SettingRow, SettingsSection } from './SettingsSection.tsx'

/* Changing the password, and ending every session of the account. If that
   fails, this browser stays signed in, so nothing looks done that is not. */

type Open = 'password' | 'signOutAll' | null

export function SecuritySection() {
  const t = useT()
  const { signOutEverywhere } = useAuth()
  const [open, setOpen] = useState<Open>(null)
  const [changed, setChanged] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<{ error: unknown } | null>(null)

  const signOutAll = async () => {
    setBusy(true)
    setFailure(null)
    try {
      await signOutEverywhere()
    } catch (error) {
      setFailure({ error })
      setBusy(false)
      setOpen(null)
    }
  }

  return (
    <SettingsSection title={t('settings.security')}>
      <SettingRow title={t('settings.password')} description={t('settings.passwordText')}>
        <Button variant="secondary" onClick={() => { setChanged(false); setOpen('password') }}>
          <KeyRound />
          {t('settings.changePassword')}
        </Button>
      </SettingRow>
      <SettingRow title={t('settings.signOutAll')} description={t('settings.signOutAllText')}>
        <Button variant="secondary" onClick={() => { setOpen('signOutAll') }}>
          <LogOut />
          {t('settings.signOutAllButton')}
        </Button>
      </SettingRow>
      {changed && <Notice tone="success">{t('settings.passwordChanged')}</Notice>}
      {failure && <Notice tone="error">{errorText(failure.error, t)}</Notice>}

      {open === 'password' && (
        <ChangePasswordDialog
          onClose={() => { setOpen(null) }}
          onChanged={() => {
            setOpen(null)
            setChanged(true)
          }}
        />
      )}
      <ConfirmDialog
        open={open === 'signOutAll'}
        title={t('settings.signOutAllConfirmTitle')}
        confirmLabel={t('settings.signOutAllButton')}
        busy={busy}
        onConfirm={() => void signOutAll()}
        onCancel={() => { setOpen(null) }}
      >
        {t('settings.signOutAllConfirmText')}
      </ConfirmDialog>
    </SettingsSection>
  )
}
