import { useCallback, useEffect, useState } from 'react'
import { errorText } from '../../lib/api.ts'
import { useT } from '../../lib/i18n.tsx'
import { Button } from '../../ui/Button.tsx'
import { Notice } from '../../ui/Notice.tsx'
import { Skeleton } from '../../ui/Skeleton.tsx'
import { SettingsSection } from '../settings/SettingsSection.tsx'
import { familyApi, type Family } from './family-api.ts'
import { FamilyDetails } from './FamilyDetails.tsx'
import { NoFamily } from './NoFamily.tsx'

/* The family part of the settings. The user is in no family (make one, or
   join with a code) or in one (its members, the owner's controls, leaving).
   Every change answers with the family as it now is, which replaces what is
   shown. */

type State = { kind: 'loading' } | { kind: 'failed'; error: unknown } | { kind: 'ready'; family: Family | null }

export function FamilySection() {
  const t = useT()
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [left, setLeft] = useState(false)

  const load = useCallback((signal?: AbortSignal) => {
    familyApi
      .get(signal)
      .then((family) => {
        setState({ kind: 'ready', family })
      })
      .catch((error: unknown) => {
        if (!signal?.aborted) setState({ kind: 'failed', error })
      })
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => { controller.abort() }
  }, [load])

  const show = (family: Family | null) => {
    setState({ kind: 'ready', family })
  }

  let body
  if (state.kind === 'loading') {
    body = (
      <div role="status" className="flex flex-col gap-3 py-3">
        <span className="sr-only">{t('common.loading')}</span>
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-11 w-full" />
      </div>
    )
  } else if (state.kind === 'failed') {
    body = (
      <div className="flex flex-col items-start gap-2">
        <Notice tone="error">
          {t('family.loadFailed')} {errorText(state.error, t)}
        </Notice>
        <Button
          variant="quiet"
          onClick={() => {
            setState({ kind: 'loading' })
            load()
          }}
        >
          {t('settings.tryAgain')}
        </Button>
      </div>
    )
  } else if (state.family === null) {
    body = (
      <>
        {left && <Notice tone="success">{t('family.left')}</Notice>}
        <NoFamily
          onJoined={(family) => {
            setLeft(false)
            show(family)
          }}
        />
      </>
    )
  } else {
    body = (
      <FamilyDetails
        family={state.family}
        onChanged={show}
        onLeft={() => {
          setLeft(true)
          show(null)
        }}
      />
    )
  }

  return <SettingsSection title={t('family.section')}>{body}</SettingsSection>
}
