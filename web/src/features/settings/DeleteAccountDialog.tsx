import { useState } from 'react'
import { api } from '../../lib/api.ts'
import { useAuth } from '../../lib/auth.tsx'
import { useT } from '../../lib/i18n.tsx'
import { Button } from '../../ui/Button.tsx'
import { Dialog } from '../../ui/Dialog.tsx'
import { Field } from '../../ui/Field.tsx'
import { PasswordDialog } from './PasswordDialog.tsx'

/* Deleting the account: typing a word confirms the intent, then the password
   is asked for on top of this dialog. Cancelling that comes back here. */

export function DeleteAccountDialog({ onClose }: { onClose: () => void }) {
  const t = useT()
  const { signOut } = useAuth()
  const word = t('settings.deleteWord')
  const [typed, setTyped] = useState('')
  const [asking, setAsking] = useState(false)

  return (
    <>
      <Dialog
        open
        onClose={() => { if (!asking) onClose() }}
        title={t('settings.deleteAccount')}
        footer={
          <>
            <Button variant="quiet" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" onClick={() => { setAsking(true) }} disabled={typed.trim() !== word}>
              {t('settings.deleteForever')}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="border-l-2 border-danger pl-4 text-sm">
            <p className="font-semibold text-danger">{t('settings.deleteWarning')}</p>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-muted">
              <li>{t('settings.deleteListBudget')}</li>
              <li>{t('settings.deleteListPlans')}</li>
              <li>{t('settings.deleteListFood')}</li>
              <li>{t('settings.deleteListAccount')}</li>
            </ul>
            <p className="mt-2 text-muted">{t('settings.deleteFamily')}</p>
          </div>
          <Field
            label={t('settings.deleteTypeWord', { word })}
            autoComplete="off"
            spellCheck={false}
            value={typed}
            onChange={(event) => { setTyped(event.target.value) }}
          />
        </div>
      </Dialog>
      {asking && (
        <PasswordDialog
          action={() => api('/api/user', { method: 'DELETE' })}
          busyLabel={t('settings.deleting')}
          // The server already ended the session; this drops everything held here.
          onDone={() => void signOut()}
          onClose={() => { setAsking(false) }}
        />
      )}
    </>
  )
}
