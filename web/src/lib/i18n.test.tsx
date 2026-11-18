import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'
import { en, enMottos } from '../i18n/en.ts'
import { ro, roMottos } from '../i18n/ro.ts'
import { renderWithProviders } from '../test/render.tsx'
import { translate, useI18n } from './i18n.tsx'

function Probe() {
  const { t, toggleLanguage } = useI18n()
  return (
    <button type="button" onClick={toggleLanguage}>
      {t('nav.budget')}
    </button>
  )
}

describe('dictionaries', () => {
  test('English has exactly the Romanian keys, none empty', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(ro).sort())
    for (const value of [...Object.values(ro), ...Object.values(en)]) expect(value.trim()).not.toBe('')
    expect(enMottos).toHaveLength(roMottos.length)
  })

  test('placeholders are the same in both languages', () => {
    const names = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort()
    for (const key of Object.keys(ro) as (keyof typeof ro)[]) expect(names(en[key]), key).toEqual(names(ro[key]))
  })

  test('translate fills placeholders', () => {
    expect(translate('ro', 'footer.copyright', { year: 2026 })).toBe('© 2026 adun')
  })
})

describe('I18nProvider', () => {
  test('starts in Romanian, switches to English, remembers it and sets <html lang>', async () => {
    renderWithProviders(<Probe />)
    expect(document.documentElement.lang).toBe('ro')

    await userEvent.click(screen.getByRole('button', { name: 'Buget' }))
    expect(screen.getByRole('button', { name: 'Budget' })).toBeDefined()
    expect(document.documentElement.lang).toBe('en')
    expect(localStorage.getItem('language')).toBe('en')
  })

  test('a stored choice is used on the next visit', () => {
    localStorage.setItem('language', 'en')
    renderWithProviders(<Probe />)
    expect(screen.getByRole('button', { name: 'Budget' })).toBeDefined()
  })
})
