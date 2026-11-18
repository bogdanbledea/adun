import { useEffect, useState } from 'react'

type ServerStatus = 'checking' | 'ok' | 'unreachable'

const STATUS_TEXT: Record<ServerStatus, string> = {
  checking: 'Checking the server…',
  ok: 'The server is up.',
  unreachable: 'The server cannot be reached.',
}

export function App() {
  const [status, setStatus] = useState<ServerStatus>('checking')

  useEffect(() => {
    const controller = new AbortController()
    fetch('/health', { signal: controller.signal })
      .then((res) => {
        setStatus(res.ok ? 'ok' : 'unreachable')
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        console.error(error)
        setStatus('unreachable')
      })
    return () => {
      controller.abort()
    }
  }, [])

  return (
    <main>
      <h1>Adun</h1>
      <p role="status">{STATUS_TEXT[status]}</p>
    </main>
  )
}
