import { useEffect, useState } from 'react'
import { useTheme } from './lib/theme.tsx'

type ServerStatus = 'checking' | 'ok' | 'unreachable'

const STATUS_TEXT: Record<ServerStatus, string> = {
  checking: 'Checking the server…',
  ok: 'The server is up.',
  unreachable: 'The server cannot be reached.',
}

const STATUS_COLOUR: Record<ServerStatus, string> = {
  checking: 'text-muted',
  ok: 'text-brand',
  unreachable: 'text-danger',
}

export function App() {
  const [status, setStatus] = useState<ServerStatus>('checking')
  const { theme, toggleTheme } = useTheme()

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
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4">
      <section className="card flex flex-col gap-2 p-6">
        <h1 className="text-3xl font-bold">Adun</h1>
        <p role="status" className={STATUS_COLOUR[status]}>
          {STATUS_TEXT[status]}
        </p>
      </section>
      <button
        type="button"
        onClick={toggleTheme}
        className="self-center rounded-full border border-line-strong px-4 py-1.5 text-sm text-muted hover:bg-hover"
      >
        {theme === 'dark' ? 'Use the light theme' : 'Use the dark theme'}
      </button>
    </main>
  )
}
