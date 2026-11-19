import { useState, type SubmitEvent } from 'react'
import { errorText } from '../../lib/api.ts'
import { useT } from '../../lib/i18n.tsx'
import { Button } from '../../ui/Button.tsx'
import { Dialog } from '../../ui/Dialog.tsx'
import { Field } from '../../ui/Field.tsx'
import { Notice } from '../../ui/Notice.tsx'
import { familyApi, type Family } from './family-api.ts'

interface RenameFamilyDialogProps {
  family: Family
  onClose: () => void
  onSaved: (family: Family) => void
}

export function RenameFamilyDialog({ family, onClose, onSaved }: RenameFamilyDialogProps) {
  const t = useT()
  const [name, setName] = useState(family.name)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  const save = async (event?: SubmitEvent) => {
    event?.preventDefault()
    setBusy(true)
    setError(null)
    try {
      onSaved(await familyApi.rename(name.trim()))
    } catch (failure) {
      setError(failure)
      setBusy(false)
    }
  }

  return (
    <Dialog
      open
      onClose={() => { if (!busy) onClose() }}
      title={t('family.renameTitle')}
      footer={
        <>
          <Button variant="quiet" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => void save()} disabled={busy || name.trim() === ''}>
            {busy ? t('common.saving') : t('common.save')}
          </Button>
        </>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={(event) => void save(event)}>
        <Field label={t('family.name')} maxLength={128} value={name} onChange={(event) => { setName(event.target.value) }} />
        {error !== null && <Notice tone="error">{errorText(error, t)}</Notice>}
      </form>
    </Dialog>
  )
}
