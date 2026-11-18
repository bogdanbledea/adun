import type { ReactNode } from 'react'
import { NavLink } from 'react-router'
import { cx } from './cx.ts'

/* Section tabs that are links: each is a URL, the current one is marked with
   aria-current="page" by NavLink and underlined in brand green. */

export interface TabLink {
  to: string
  label: string
  icon?: ReactNode
}

export function Tabs({ label, tabs }: { label: string; tabs: TabLink[] }) {
  return (
    <nav aria-label={label} className="-mb-px grid grid-flow-col auto-cols-fr sm:flex sm:gap-1">
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          className={({ isActive }) =>
            cx(
              'flex min-h-11 pointer-fine:min-h-9 min-w-0 items-center justify-center gap-2 border-b-2 px-3 text-sm font-semibold',
              'transition-colors duration-150 sm:justify-start sm:px-4 [&_svg]:size-4 [&_svg]:shrink-0',
              isActive ? 'border-brand text-brand-deep' : 'border-transparent text-muted hover:text-ink',
            )
          }
        >
          {tab.icon}
          <span className="truncate">{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
