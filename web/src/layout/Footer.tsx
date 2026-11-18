import { Link } from 'react-router'
import { useT } from '../lib/i18n.tsx'
import { Brand } from './Brand.tsx'

export function Footer() {
  const t = useT()
  return (
    <footer className="mt-auto border-t border-line px-4 py-7 sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
        <Brand />
        <nav className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-muted">
          <Link to="/confidentialitate" className="transition-colors duration-150 hover:text-ink">
            {t('footer.privacy')}
          </Link>
        </nav>
        <p className="text-xs text-muted">{t('footer.copyright', { year: new Date().getFullYear() })}</p>
      </div>
    </footer>
  )
}
