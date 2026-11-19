import { Check, Copy, Ticket } from 'lucide-react'
import { useState } from 'react'
import { errorText } from '../../lib/api.ts'
import { useI18n } from '../../lib/i18n.tsx'
import { Button, IconButton } from '../../ui/Button.tsx'
import { Notice } from '../../ui/Notice.tsx'
import { dayLong } from '../budget/month-key.ts'
import { familyApi, type FamilyInvite } from './family-api.ts'

/* The owner's invite code. It is shown only right after it is made: the
   server keeps only its hash, and a new code cancels the last one. */

export function InvitePanel() {
  const { t, language } = useI18n()
  const [invite, setInvite] = useState<FamilyInvite | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<unknown>(null)

  const create = async () => {
    setBusy(true)
    setError(null)
    setCopied(false)
    try {
      setInvite(await familyApi.invite())
    } catch (failure) {
      setError(failure)
    } finally {
      setBusy(false)
    }
  }

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
    } catch {
      // No clipboard (an old browser, or permission refused): the code is on screen.
    }
  }

  return (
    <div className="flex flex-col gap-3 border-t border-line py-3">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <div className="min-w-0 flex-1 basis-64">
          <p className="font-semibold">{t('family.inviteTitle')}</p>
          <p className="mt-0.5 text-sm text-muted">{t('family.inviteText')}</p>
        </div>
        <Button variant="secondary" onClick={() => void create()} disabled={busy}>
          <Ticket />
          {invite ? t('family.anotherCode') : t('family.newCode')}
        </Button>
      </div>
      {invite && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg bg-track px-4 py-3">
          <output aria-label={t('family.code')} className="font-mono text-2xl font-semibold tracking-[0.3em] text-brand-deep">
            {invite.code}
          </output>
          <IconButton label={t('family.copyCode')} onClick={() => void copy(invite.code)}>
            {copied ? <Check /> : <Copy />}
          </IconButton>
          <p className="w-full text-sm text-muted">
            {t('family.codeValidUntil', { date: dayLong(invite.expiresAt, language) })}
            {copied && <span role="status"> {t('family.codeCopied')}</span>}
          </p>
        </div>
      )}
      {error !== null && <Notice tone="error">{errorText(error, t)}</Notice>}
    </div>
  )
}
