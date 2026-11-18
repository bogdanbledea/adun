import type { ReactNode } from 'react'
import { Footer } from '../../layout/Footer.tsx'
import { PublicHeader } from '../../layout/PublicHeader.tsx'
import { cx } from '../../ui/cx.ts'

/* The frame of every signed-out page: brand, theme and language controls,
   one titled panel, the footer. `aside` sits beside the panel on wide screens. */

interface AuthLayoutProps {
  title: string
  children: ReactNode
  aside?: ReactNode
}

export function AuthLayout({ title, children, aside }: AuthLayoutProps) {
  return (
    <div className="flex min-h-dvh flex-col overflow-x-clip bg-page text-ink">
      <PublicHeader />

      <main
        className={cx(
          'mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 px-4 py-10 sm:px-6 sm:py-16',
          aside ? 'lg:grid-cols-[1fr_26rem]' : undefined,
        )}
      >
        {aside}
        <section
          aria-labelledby="auth-title"
          className={cx(
            'w-full max-w-md justify-self-center card p-5 sm:p-7',
            // Beside an aside the panel fills its column.
            aside ? 'lg:max-w-none' : undefined,
          )}
        >
          <h1 id="auth-title" className="border-b border-brand-deep pb-4 text-2xl font-semibold tracking-tight">
            {title}
          </h1>
          {children}
        </section>
      </main>

      <Footer />
    </div>
  )
}
