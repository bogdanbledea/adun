import { Download, Eraser, Trash2, Upload } from 'lucide-react'
import { useRef, useState, type ChangeEvent } from 'react'
import { api, ApiError, errorText } from '../../lib/api.ts'
import { useAuth, type AuthUser } from '../../lib/auth.tsx'
import { useT } from '../../lib/i18n.tsx'
import { Button } from '../../ui/Button.tsx'
import { ConfirmDialog } from '../../ui/Dialog.tsx'
import { Notice } from '../../ui/Notice.tsx'
import { todayDate } from '../budget/month-key.ts'
import { DeleteAccountDialog } from './DeleteAccountDialog.tsx'
import { PasswordDialog } from './PasswordDialog.tsx'
import { SettingRow, SettingsSection } from './SettingsSection.tsx'

/* Export, import, erasing the activity history and deleting the account.
   Export and deletion ask for the password first; the import sends a chosen
   file, which the server takes only into an empty account. Each of the first
   three changes the history, so the section tells the page to load it again. */

type Open = 'export' | 'clearActivity' | 'deleteAccount' | null

type Outcome = { tone: 'success'; text: string } | { tone: 'error'; error: unknown } | null

function saveFile(data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `adun-export-${todayDate()}.json`
  link.click()
  URL.revokeObjectURL(url)
}

// A file that is not JSON gets the same answer as one the server refuses.
async function readFile(file: File): Promise<unknown> {
  try {
    return JSON.parse(await file.text()) as unknown
  } catch {
    throw new ApiError(400, 'invalid_export', 'Invalid file.')
  }
}

export function DataSection({ onChanged }: { onChanged: () => void }) {
  const t = useT()
  const { signedIn } = useAuth()
  const [open, setOpen] = useState<Open>(null)
  const [busy, setBusy] = useState<'import' | 'clear' | null>(null)
  const [outcome, setOutcome] = useState<Outcome>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const exported = (data: unknown) => {
    saveFile(data)
    setOpen(null)
    setOutcome({ tone: 'success', text: t('settings.exported') })
    onChanged()
  }

  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    // The same file can be chosen again after a failure.
    event.target.value = ''
    if (!file) return
    setBusy('import')
    setOutcome(null)
    try {
      await api('/api/data/import', { method: 'POST', body: await readFile(file) })
      // The file brings the pay-period rule along.
      signedIn(await api<AuthUser>('/api/user/me'))
      setOutcome({ tone: 'success', text: t('settings.imported') })
      onChanged()
    } catch (error) {
      setOutcome({ tone: 'error', error })
    }
    setBusy(null)
  }

  const clearActivity = async () => {
    setBusy('clear')
    setOutcome(null)
    try {
      await api('/api/activity', { method: 'DELETE' })
      setOutcome({ tone: 'success', text: t('settings.activityCleared') })
      onChanged()
    } catch (error) {
      setOutcome({ tone: 'error', error })
    }
    setBusy(null)
    setOpen(null)
  }

  return (
    <SettingsSection title={t('settings.dataTitle')}>
      <SettingRow title={t('settings.export')} description={t('settings.exportText')}>
        <Button variant="secondary" disabled={busy !== null} onClick={() => { setOutcome(null); setOpen('export') }}>
          <Download />
          {t('settings.exportButton')}
        </Button>
      </SettingRow>
      <SettingRow title={t('settings.import')} description={t('settings.importText')}>
        <Button variant="secondary" disabled={busy !== null} onClick={() => fileInput.current?.click()}>
          <Upload />
          {busy === 'import' ? t('settings.importing') : t('settings.importButton')}
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="hidden"
          aria-label={t('settings.import')}
          onChange={(event) => void importFile(event)}
        />
      </SettingRow>
      <SettingRow title={t('settings.clearActivity')} description={t('settings.clearActivityText')}>
        <Button variant="secondary" disabled={busy !== null} onClick={() => { setOpen('clearActivity') }}>
          <Eraser />
          {t('settings.clearActivityButton')}
        </Button>
      </SettingRow>
      <SettingRow title={t('settings.deleteAccount')} description={t('settings.deleteAccountText')}>
        <Button
          variant="secondary"
          className="border-danger text-danger! hover:text-danger!"
          disabled={busy !== null}
          onClick={() => { setOpen('deleteAccount') }}
        >
          <Trash2 />
          {t('settings.deleteAccount')}
        </Button>
      </SettingRow>
      {outcome && (
        <div className="mt-2">
          <Notice tone={outcome.tone}>{outcome.tone === 'success' ? outcome.text : errorText(outcome.error, t)}</Notice>
        </div>
      )}
      {open === 'export' && (
        <PasswordDialog
          action={() => api<unknown>('/api/data/export', { method: 'POST' })}
          busyLabel={t('settings.exporting')}
          onDone={exported}
          onClose={() => { setOpen(null) }}
        />
      )}
      <ConfirmDialog
        open={open === 'clearActivity'}
        title={t('settings.clearActivityConfirmTitle')}
        confirmLabel={t('settings.clearActivityButton')}
        destructive
        busy={busy === 'clear'}
        onConfirm={() => void clearActivity()}
        onCancel={() => { setOpen(null) }}
      >
        {t('settings.clearActivityConfirmText')}
      </ConfirmDialog>
      {open === 'deleteAccount' && <DeleteAccountDialog onClose={() => { setOpen(null) }} />}
    </SettingsSection>
  )
}
