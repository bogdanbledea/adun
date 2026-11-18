import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, setUnauthorizedHandler } from './api.ts'

/* Who is signed in. The answer comes from GET /api/user/me at start-up, then
   from the sign-in response; any failure at start-up means "signed out". When
   a request later reports that the session is gone, the state drops to signed
   out, which unmounts the signed-in screens and with them every piece of data
   they held. */

/** The account as GET /api/user/me and POST /api/auth/login return it. */
export interface AuthUser {
  id: string
  email: string
  displayName: string
  privacyAcceptedAt: string
  privacyPolicyVersion: string
  createdAt: string
}

export type AuthState = { status: 'loading' } | { status: 'signed_out' } | { status: 'signed_in'; user: AuthUser }

interface AuthValue {
  state: AuthState
  /** Called by the sign-in form with the account it received. */
  signedIn: (user: AuthUser) => void
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' })

  useEffect(() => {
    const controller = new AbortController()
    api<AuthUser>('/api/user/me', { signal: controller.signal })
      .then((user) => { setState({ status: 'signed_in', user }) })
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: 'signed_out' })
      })
    return () => { controller.abort() }
  }, [])

  useEffect(() => setUnauthorizedHandler(() => { setState({ status: 'signed_out' }) }), [])

  const signedIn = useCallback((user: AuthUser) => { setState({ status: 'signed_in', user }) }, [])

  const value = useMemo(() => ({ state, signedIn }), [state, signedIn])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
