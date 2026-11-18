import { MailCheck } from 'lucide-react'

/* "Check your email", after signing up or signing in unconfirmed. Nothing
   more happens in this tab until the user opens their inbox. */

export function MailSent({ text }: { text: string }) {
  return (
    <div className="mt-6 flex flex-col items-center gap-3 border-y border-line py-6 text-center">
      <MailCheck className="size-7 text-brand" aria-hidden="true" />
      <p className="text-sm text-muted">{text}</p>
    </div>
  )
}
