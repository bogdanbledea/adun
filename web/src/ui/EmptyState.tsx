import type { ReactNode } from 'react'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  children?: ReactNode
  /** Buttons that start filling the empty place. */
  action?: ReactNode
}

export function EmptyState({ icon, title, children, action }: EmptyStateProps) {
  return (
    <section className="card px-5 py-8 text-center sm:px-10 sm:py-10">
      {icon && <div className="mx-auto mb-5 w-fit text-brand [&_svg]:size-7">{icon}</div>}
      <h2 className="mx-auto max-w-lg text-2xl font-semibold">{title}</h2>
      {children && <div className="mx-auto mt-3 max-w-md text-muted">{children}</div>}
      {action && <div className="mt-8 flex flex-wrap justify-center gap-3">{action}</div>}
    </section>
  )
}
