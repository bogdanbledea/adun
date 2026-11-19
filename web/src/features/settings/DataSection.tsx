import { Download, Upload } from 'lucide-react'
import { useRef, useState, type ChangeEvent, type SubmitEvent } from 'react'
import { api, ApiError, errorText } from '../../lib/api.ts'
import { useAuth, type AuthUser } from '../../lib/auth.tsx'
import { useT } from '../../lib/i18n.tsx'
import { Button } from '../../ui/Button.tsx'
import { Dialog } from '../../ui/Dialog.tsx'
import { Notice } from '../../ui/Notice.tsx'
import { PasswordField } from '../auth/PasswordField.tsx'
import { todayDate } from '../budget/month-key.ts'
import { SettingRow, SettingsSection } from './SettingsSection.tsx'

/* Export and import of the user's own data. The export asks for the password
   first (the server wants it confirmed on this session just before) and
   saves the file it answers with; the import sends a chosen file, which the
   server takes only into an empty account. Both are written in the activity
   history, so the section tells the page to load it again. */

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
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState<'export' | 'import' | null>(null)
  const [outcome, setOutcome] = useState<Outcome>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const exported = (data: unknown) => {
    saveFile(data)
    setAsking(false)
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

  return (
    <SettingsSection title={t('settings.dataTitle')}>
      <SettingRow title={t('settings.export')} description={t('settings.exportText')}>
        <Button variant="secondary" disabled={busy !== null} onClick={() => { setOutcome(null); setAsking(true) }}>
          <Download />
          {busy === 'export' ? t('settings.exporting') : t('settings.exportButton')}
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
      {outcome && (
        <div className="mt-2">
          <Notice tone={outcome.tone}>{outcome.tone === 'success' ? outcome.text : errorText(outcome.error, t)}</Notice>
        </div>
      )}
      {asking && (
        <ExportDialog
          onBusy={(exporting) => { setBusy(exporting ? 'export' : null) }}
          onDone={exported}
          onClose={() => { setAsking(false) }}
        />
      )}
    </SettingsSection>
  )
}

interface ExportDialogProps {
  onBusy: (busy: boolean) => void
  onDone: (data: unknown) => void
  onClose: () => void
}

/** Asks for the password, confirms it on this session, then fetches the file. */
function ExportDialog({ onBusy, onDone, onClose }: ExportDialogProps) {
  const t = useT()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<{ error: unknown } | null>(null)

  const submit = async (event: SubmitEvent) => {
    event.preventDefault()
    setFailure(null)
    setBusy(true)
    onBusy(true)
    try {
      await api('/api/auth/confirm-password', { method: 'POST', body: { password } })
      onDone(await api<unknown>('/api/data/export', { method: 'POST' }))
    } catch (error) {
      setFailure({ error })
      setBusy(false)
    }
    onBusy(false)
  }

  return (
    <Dialog
      open
      onClose={() => { if (!busy) onClose() }}
      title={t('settings.confirmTitle')}
      footer={
        <>
          <Button variant="quiet" onClick={onClose} disabled={busy}>
            {t('settings.cancel')}
          </Button>
          <Button type="submit" form="export-password" disabled={busy}>
            {busy ? t('settings.exporting') : t('settings.confirm')}
          </Button>
        </>
      }
    >
      <form id="export-password" onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
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
