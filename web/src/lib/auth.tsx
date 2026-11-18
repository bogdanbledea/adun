import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { api, setUnauthorizedHandler } from './api.ts'

/* Who is signed in. The answer comes from GET /api/user/me at start-up, then
   from the sign-in response; any failure at start-up means "signed out". When
   a request later reports that the session is gone, or the user signs out, the
   state drops to signed out, which unmounts the signed-in screens and with them
   every piece of data they held. */

/** The account as GET /api/user/me and POST /api/auth/login return it. */
export interface AuthUser {
  id: string
  email: string
  displayName: string
  createdAt: string
}

export type AuthState = { status: 'loading' } | { status: 'signed_out' } | { status: 'signed_in'; user: AuthUser }

interface AuthValue {
  state: AuthState
  /** Called with the account the server answered with: by the sign-in form,
      and after a change to the account. */
  signedIn: (user: AuthUser) => void
  /** Ends this session on the server, then everything held here. */
  signOut: () => Promise<void>
  /** Ends every session of the account, on every device, this one included. */
  signOutEverywhere: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' })
  const navigate = useNavigate()

  useEffect(() => {
    const controller = new AbortController()
    // Only while still loading: a page that signs in by itself (an email
    // link) may have answered first, and that answer is the newer one.
    const settle = (next: AuthState) => {
      setState((current) => (current.status === 'loading' ? next : current))
    }
    api<AuthUser>('/api/user/me', { signal: controller.signal })
      .then((user) => { settle({ status: 'signed_in', user }) })
      .catch(() => {
        if (!controller.signal.aborted) settle({ status: 'signed_out' })
      })
    return () => { controller.abort() }
  }, [])

  useEffect(() => setUnauthorizedHandler(() => { setState({ status: 'signed_out' }) }), [])

  const signedIn = useCallback((user: AuthUser) => { setState({ status: 'signed_in', user }) }, [])

  const signedOut = useCallback(() => {
    setState({ status: 'signed_out' })
    // Replace, so Back does not return to a page of the signed-out account.
    void navigate('/', { replace: true })
  }, [navigate])

  const signOut = useCallback(async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' })
    } catch {
      // Signed out here either way; the server session expires on its own.
    }
    signedOut()
  }, [signedOut])

  // Unlike signOut, a failure changes nothing: signing out only this browser
  // would look as if the other devices were signed out too.
  const signOutEverywhere = useCallback(async () => {
    await api('/api/auth/logout-all', { method: 'POST' })
    signedOut()
  }, [signedOut])

  const value = useMemo(
    () => ({ state, signedIn, signOut, signOutEverywhere }),
    [state, signedIn, signOut, signOutEverywhere],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
