import { useT } from '../lib/i18n.tsx'
import { Brand } from './Brand.tsx'

export function Footer() {
  const t = useT()
  return (
    <footer className="mt-auto border-t border-line px-4 py-7 sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
        <Brand />
        <p className="text-xs text-muted">{t('footer.copyright', { year: new Date().getFullYear() })}</p>
      </div>
    </footer>
  )
}
