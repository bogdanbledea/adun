import type { ReactNode } from 'react'
import { useT } from '../../lib/i18n.tsx'

/* /confidentialitate: what the app stores, where, and who to ask. Open to
   everyone, signed in or not. It describes the software; how the data on a
   given server is used is up to whoever runs it. */

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-line py-6">
      <h2 className="text-xl font-semibold text-brand-deep">{title}</h2>
      <div className="mt-3 space-y-3 leading-relaxed [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5">{children}</div>
    </section>
  )
}

export function PrivacyPage() {
  const t = useT()
  return (
    <article className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight">{t('privacyPage.title')}</h1>
      <p className="mt-3 pb-6 text-lg text-muted">{t('privacyPage.intro')}</p>

      <Section title={t('privacyPage.storedTitle')}>
        <ul>
          <li>{t('privacyPage.storedAccount')}</li>
          <li>{t('privacyPage.storedSessions')}</li>
        </ul>
        <p>{t('privacyPage.storedNot')}</p>
      </Section>

      <Section title={t('privacyPage.whereTitle')}>
        <p>{t('privacyPage.whereText')}</p>
        <p>{t('privacyPage.whereEmail')}</p>
      </Section>

      <Section title={t('privacyPage.browserTitle')}>
        <ul>
          <li>{t('privacyPage.browserCookie')}</li>
          <li>{t('privacyPage.browserStorage')}</li>
        </ul>
        <p>{t('privacyPage.browserNoTracking')}</p>
      </Section>

      <Section title={t('privacyPage.contactTitle')}>
        <p>{t('privacyPage.contactAdmin')}</p>
      </Section>
    </article>
  )
}
