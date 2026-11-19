import { useId, type ReactNode } from 'react'

/** A titled part of the settings page, separated from the one above by a line. */
export function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="border-t border-line px-4 py-5 first:border-t-0 sm:px-6">
      <h2 id={id} className="mb-3 text-lg font-semibold text-brand-deep">
        {title}
      </h2>
      {children}
    </section>
  )
}

interface SettingRowProps {
  title: string
  description?: ReactNode
  children: ReactNode
}

/** "What this is" on the left and its control on the right. */
export function SettingRow({ title, description, children }: SettingRowProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-line py-3 first:border-t-0">
      <div className="min-w-0 flex-1 basis-64">
        <p className="font-semibold">{title}</p>
        {description && <div className="mt-0.5 text-sm text-muted">{description}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}
