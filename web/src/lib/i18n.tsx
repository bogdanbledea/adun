import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { en, enMottos } from '../i18n/en.ts'
import { ro, roMottos, type MessageKey } from '../i18n/ro.ts'
import { readStored, writeStored } from './storage.ts'

/* Two languages, Romanian by default. The choice is kept in localStorage and
   mirrored on <html lang>. URLs never change with the language. */

export type Language = 'ro' | 'en'
export type { MessageKey }
export type Params = Record<string, string | number>
export type Translate = (key: MessageKey, params?: Params) => string

const STORAGE_KEY = 'language'
const dictionaries: Record<Language, Record<MessageKey, string>> = { ro, en }
const mottos: Record<Language, readonly string[]> = { ro: roMottos, en: enMottos }

/** Puts each value in place of its `{name}`; a name without a value stays as written. */
export function fillParams(text: string, params?: Params): string {
  if (!params) return text
  return text.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match))
}

export function translate(language: Language, key: MessageKey, params?: Params): string {
  return fillParams(dictionaries[language][key], params)
}

function readLanguage(): Language {
  return readStored(STORAGE_KEY) === 'en' ? 'en' : 'ro'
}

interface I18nValue {
  language: Language
  setLanguage: (language: Language) => void
  toggleLanguage: () => void
  t: Translate
  mottos: readonly string[]
}

const I18nContext = createContext<I18nValue | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(readLanguage)

  useEffect(() => {
    writeStored(STORAGE_KEY, language)
    document.documentElement.lang = language
  }, [language])

  const toggleLanguage = useCallback(() => {
    setLanguage((current) => (current === 'ro' ? 'en' : 'ro'))
  }, [])

  const value = useMemo<I18nValue>(
    () => ({
      language,
      setLanguage,
      toggleLanguage,
      t: (key, params) => translate(language, key, params),
      mottos: mottos[language],
    }),
    [language, toggleLanguage],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext)
  if (!value) throw new Error('useI18n must be used inside I18nProvider')
  return value
}

export function useT(): Translate {
  return useI18n().t
}
