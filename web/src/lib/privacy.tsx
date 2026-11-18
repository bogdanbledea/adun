import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { readStored, writeStored } from './storage.ts'

/* Hide amounts: the eye button in the header blurs every amount, for instance
   while someone looks over your shoulder. The choice is remembered on this
   device like the theme, so the next visit starts the same way. */

const STORAGE_KEY = 'amountsHidden'

interface PrivacyValue {
  amountsHidden: boolean
  toggleAmounts: () => void
}

const PrivacyContext = createContext<PrivacyValue | null>(null)

export function PrivacyProvider({ children }: { children: ReactNode }) {
  const [amountsHidden, setAmountsHidden] = useState(() => readStored(STORAGE_KEY) === 'true')

  const toggleAmounts = useCallback(() => {
    setAmountsHidden((hidden) => {
      writeStored(STORAGE_KEY, hidden ? null : 'true')
      return !hidden
    })
  }, [])

  const value = useMemo(() => ({ amountsHidden, toggleAmounts }), [amountsHidden, toggleAmounts])
  return <PrivacyContext.Provider value={value}>{children}</PrivacyContext.Provider>
}

export function usePrivacy(): PrivacyValue {
  const value = useContext(PrivacyContext)
  if (!value) throw new Error('usePrivacy must be used inside PrivacyProvider')
  return value
}
