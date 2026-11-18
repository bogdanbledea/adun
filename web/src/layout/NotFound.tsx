import { Link } from 'react-router'
import { useT } from '../lib/i18n.tsx'
import { buttonClass } from '../ui/button-styles.ts'
import { EmptyState } from '../ui/EmptyState.tsx'

export function NotFound() {
  const t = useT()
  return (
    <EmptyState
      title={t('page.notFoundTitle')}
      action={
        <Link to="/buget" className={buttonClass('secondary')}>
          {t('page.backToBudget')}
        </Link>
      }
    >
      {t('page.notFoundText')}
    </EmptyState>
  )
}
