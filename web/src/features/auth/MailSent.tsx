import { MailCheck } from 'lucide-react'
import { useState } from 'react'
import { api, errorText } from '../../lib/api.ts'
import { useI18n } from '../../lib/i18n.tsx'
import { Notice } from '../../ui/Notice.tsx'

/* "Check your email", after signing up, signing in unconfirmed or asking for
   a new password. Nothing more happens in this tab until the user opens their
   inbox. The link can be sent again; the server limits how often, but answers
   the same either way. */

interface MailSentProps {
  text: string
  /** Where to ask for the email again, for which address, and what to say once asked. */
  resend: { path: string; email: string; doneText: string }
}

export function MailSent({ text, resend: { path, email, doneText } }: MailSentProps) {
  const { t, language } = useI18n()
  const [result, setResult] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const resend = async () => {
    setResult(null)
    setBusy(true)
    try {
      await api(path, { method: 'POST', body: { email, language } })
      setResult({ tone: 'success', text: doneText })
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
