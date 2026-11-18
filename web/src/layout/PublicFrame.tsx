import type { ReactNode } from 'react'
import { Footer } from './Footer.tsx'
import { PublicHeader } from './PublicHeader.tsx'

/** A full page of reading (the privacy page) for someone not signed in. */
export function PublicFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col overflow-x-clip bg-page text-ink">
      <PublicHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-12">{children}</main>
      <Footer />
    </div>
  )
}
