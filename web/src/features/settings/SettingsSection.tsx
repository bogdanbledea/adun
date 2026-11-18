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
