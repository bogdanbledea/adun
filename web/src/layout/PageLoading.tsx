import { useT } from '../lib/i18n.tsx'
import { Skeleton } from '../ui/Skeleton.tsx'

/** Shown while the session check is on its way. */
export function PageLoading() {
  const t = useT()
  return (
    <div role="status" className="mx-auto w-full max-w-6xl space-y-4 px-4 py-8 sm:px-6">
      <span className="sr-only">{t('common.loading')}</span>
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-28 w-full" />
    </div>
  )
}
