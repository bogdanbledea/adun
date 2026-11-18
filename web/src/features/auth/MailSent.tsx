import { MailCheck } from 'lucide-react'
import { useState } from 'react'
import { api, errorText } from '../../lib/api.ts'
import { useI18n } from '../../lib/i18n.tsx'
import { Notice } from '../../ui/Notice.tsx'

/* "Check your email", after signing up or signing in unconfirmed. Nothing
   more happens in this tab until the user opens their inbox. The link can be
   sent again; the server limits how often, but answers the same either way. */

interface MailSentProps {
  text: string
  /** The address to send the confirmation link to again. */
  resendTo: string
}

export function MailSent({ text, resendTo }: MailSentProps) {
  const { t, language } = useI18n()
  const [result, setResult] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const resend = async () => {
    setResult(null)
    setBusy(true)
    try {
      await api('/api/auth/resend-verification', { method: 'POST', body: { email: resendTo, language } })
      setResult({ tone: 'success', text: t('auth.resent') })
    } catch (err) {
      setResult({ tone: 'error', text: errorText(err, t) })
    }
    setBusy(false)
  }

  return (
    <>
      <div className="mt-6 flex flex-col items-center gap-3 border-y border-line py-6 text-center">
        <MailCheck className="size-7 text-brand" aria-hidden="true" />
        <p className="text-sm text-muted">{text}</p>
      </div>
      <p className="mt-5 text-center text-sm text-muted">
        {t('auth.noEmail')}{' '}
        <button
          type="button"
          disabled={busy}
          onClick={() => void resend()}
          className="font-semibold text-brand underline-offset-2 hover:underline disabled:opacity-60"
        >
          {t('auth.resend')}
        </button>
      </p>
      {result && (
        <div className="mt-4">
          <Notice tone={result.tone}>{result.text}</Notice>
        </div>
      )}
    </>
  )
}
