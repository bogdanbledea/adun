import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'

/* Email links carry their token in the fragment (#token=…), which browsers do
   not send to the server. The page reads it once, then removes it from the
   address bar and the history entry, so it is not left in a bookmark, a shared
   screenshot or the Back list. Reloading after that shows "invalid link". */

export function useLinkToken(): string | null {
  const location = useLocation()
  const navigate = useNavigate()
  const [token] = useState(() => new URLSearchParams(location.hash.slice(1)).get('token') || null)

  useEffect(() => {
    if (location.hash) void navigate({ pathname: location.pathname, search: location.search }, { replace: true })
  }, [location.hash, location.pathname, location.search, navigate])

  return token
}
