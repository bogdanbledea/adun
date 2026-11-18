import { CircleAlert, CircleCheck, Info } from 'lucide-react'
import type { ReactNode } from 'react'
import { cx } from './cx.ts'

/* An inline message next to what it is about. Errors are announced at once
   (role="alert"); information and success politely (role="status"). */

type NoticeTone = 'info' | 'success' | 'error'

const TONES: Record<NoticeTone, { border: string; icon: ReactNode }> = {
  info: { border: 'border-info/40', icon: <Info className="text-info" /> },
  success: { border: 'border-brand/40', icon: <CircleCheck className="text-brand" /> },
  error: { border: 'border-danger/50', icon: <CircleAlert className="text-danger" /> },
}

export function Notice({ tone = 'info', children }: { tone?: NoticeTone; children: ReactNode }) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cx('flex items-start gap-3 rounded-lg border bg-paper px-3.5 py-2.5 text-sm', TONES[tone].border)}
    >
      <span className="mt-0.5 shrink-0 [&_svg]:size-4">{TONES[tone].icon}</span>
      <div className="min-w-0 flex-1 py-px text-ink">{children}</div>
    </div>
  )
}
