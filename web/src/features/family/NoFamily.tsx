import { useState, type SubmitEvent } from 'react'
import { errorText } from '../../lib/api.ts'
import { useT } from '../../lib/i18n.tsx'
import { Button } from '../../ui/Button.tsx'
import { Field } from '../../ui/Field.tsx'
import { Notice } from '../../ui/Notice.tsx'
import { familyApi, type Family } from './family-api.ts'

/* Not in a family yet: make one, or join one with an invite code. */

type Form = 'create' | 'join'

export function NoFamily({ onJoined }: { onJoined: (family: Family) => void }) {
  const t = useT()
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState<Form | null>(null)
  const [failure, setFailure] = useState<{ form: Form; error: unknown } | null>(null)

  const submit = async (event: SubmitEvent, form: Form, action: () => Promise<Family>) => {
    event.preventDefault()
    setBusy(form)
    setFailure(null)
    try {
      onJoined(await action())
    } catch (error) {
      setFailure({ form, error })
      setBusy(null)
    }
  }

  const failureFor = (form: Form) =>
    failure?.form === form && <Notice tone="error">{errorText(failure.error, t)}</Notice>

  return (
    <div className="flex flex-col divide-y divide-line">
      <form
        className="flex flex-col gap-3 py-3"
        onSubmit={(event) => void submit(event, 'create', () => familyApi.create(name.trim()))}
      >
        <div>
          <p className="font-semibold">{t('family.createTitle')}</p>
          <p className="mt-0.5 text-sm text-muted">{t('family.createText')}</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Field
              label={t('family.name')}
              placeholder={t('family.namePlaceholder')}
              maxLength={128}
              value={name}
              onChange={(event) => { setName(event.target.value) }}
            />
          </div>
          <Button type="submit" disabled={busy !== null || name.trim() === ''}>
            {t('family.create')}
          </Button>
        </div>
        {failureFor('create')}
      </form>

      <form className="flex flex-col gap-3 py-3" onSubmit={(event) => void submit(event, 'join', () => familyApi.join(code))}>
        <div>
          <p className="font-semibold">{t('family.joinTitle')}</p>
          <p className="mt-0.5 text-sm text-muted">{t('family.joinText')}</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Field
              label={t('family.code')}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={12}
              className="font-mono tracking-widest uppercase"
              value={code}
              onChange={(event) => { setCode(event.target.value.toUpperCase()) }}
            />
          </div>
          <Button type="submit" variant="secondary" disabled={busy !== null || code.trim() === ''}>
            {t('family.join')}
          </Button>
        </div>
        {failureFor('join')}
      </form>
    </div>
  )
}
