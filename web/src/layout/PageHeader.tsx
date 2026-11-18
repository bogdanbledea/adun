import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  subtitle: string
  /** The page's main button or controls: under the title on phones, beside it from `sm` up. */
  action?: ReactNode
}

/** The top of a page: its title and a line about it. */
export function PageHeader({ title, subtitle, action }: PageHeaderProps) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 max-w-xl text-muted">{subtitle}</p>
      </div>
      {action}
    </header>
  )
}
