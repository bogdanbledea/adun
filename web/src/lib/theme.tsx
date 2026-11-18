import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { readStored, writeStored } from './storage.ts'

/* Light, dark, or the system's choice (the default). Only an explicit choice
   puts a class on <html>; with "system" the stylesheet's prefers-color-scheme
   query decides, so the right palette paints before React mounts without an
   inline script (the CSP forbids those). */

export type ThemePreference = 'system' | 'light' | 'dark'
export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'theme'
const DARK_QUERY = '(prefers-color-scheme: dark)'

function readPreference(): ThemePreference {
  const stored = readStored(STORAGE_KEY)
  return stored === 'light' || stored === 'dark' ? stored : 'system'
}

function systemTheme(): Theme {
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light'
}

interface ThemeValue {
  preference: ThemePreference
  theme: Theme
  setPreference: (preference: ThemePreference) => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readPreference)
  const [system, setSystem] = useState<Theme>(systemTheme)
  const theme = preference === 'system' ? system : preference

  useEffect(() => {
    const query = window.matchMedia(DARK_QUERY)
    const onChange = () => { setSystem(query.matches ? 'dark' : 'light') }
    query.addEventListener('change', onChange)
    return () => { query.removeEventListener('change', onChange) }
  }, [])

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('light', preference === 'light')
    root.classList.toggle('dark', preference === 'dark')

    // index.html has one theme-color per colour scheme for the first paint.
    // Those follow the system, so replace them with a single tag that follows
    // the theme in use, read back from the page so colours live only in CSS.
    document.querySelectorAll('meta[name="theme-color"][media]').forEach((tag) => { tag.remove() })
    let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    if (!meta) {
      meta = document.createElement('meta')
      meta.name = 'theme-color'
      document.head.appendChild(meta)
    }
    meta.content = getComputedStyle(document.body).backgroundColor
  }, [preference, theme])

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next)
    writeStored(STORAGE_KEY, next === 'system' ? null : next)
  }, [])

  const toggleTheme = useCallback(() => {
    setPreference(theme === 'dark' ? 'light' : 'dark')
  }, [theme, setPreference])

  const value = useMemo(
    () => ({ preference, theme, setPreference, toggleTheme }),
    [preference, theme, setPreference, toggleTheme],
  )
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeValue {
  const value = useContext(ThemeContext)
  if (!value) throw new Error('useTheme must be used inside ThemeProvider')
  return value
}
