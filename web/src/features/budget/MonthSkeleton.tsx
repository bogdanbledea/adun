import { useT } from '../../lib/i18n.tsx'
import { Skeleton } from '../../ui/Skeleton.tsx'

// Shaped like the summary and the list, so nothing jumps when data lands.
export function MonthSkeleton() {
  const t = useT()
  return (
    <div role="status" aria-label={t('common.loading')}>
      <div className="card p-5 sm:p-6">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="mt-4 h-10 w-52" />
        <Skeleton className="mt-4 h-2 w-full" />
      </div>
      <div className="mt-5 divide-y divide-line card">
        {[0, 1, 2].map((i) => (
          <div key={i} className="px-4 py-4">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="mt-3 h-3 w-full max-w-md" />
          </div>
        ))}
      </div>
    </div>
  )
}
