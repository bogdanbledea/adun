import { useEffect, useState } from 'react'
import { api } from './api.ts'

/* What the server says about itself: whether it takes new accounts and
   whether it sends email. Null until it answers. */

export interface ServerStatus {
  registrationsEnabled: boolean
  emailEnabled: boolean
}

export function useServerStatus(): ServerStatus | null {
  const [status, setStatus] = useState<ServerStatus | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    api<ServerStatus>('/api/auth/status', { signal: controller.signal })
      .then(setStatus)
      .catch(() => {
        // Offer sign-up anyway; the server refuses it if registrations are off.
        if (!controller.signal.aborted) setStatus({ registrationsEnabled: true, emailEnabled: false })
      })
    return () => { controller.abort() }
  }, [])
  return status
}
