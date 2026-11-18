import type { Server } from 'node:http'
import type { Logger } from './lib/log.ts'

export interface ShutdownDeps {
  server: Server
  log: Logger
  // How long in-flight requests may take before their connections are cut.
  timeoutMs?: number
}

/* Graceful shutdown, on SIGTERM (docker stop) or SIGINT: stop accepting
   connections and let requests already in progress finish. */
export async function shutdown({ server, log, timeoutMs = 10_000 }: ShutdownDeps): Promise<void> {
  const closed = new Promise<void>((resolve) => {
    // Stops listening and closes idle keep-alive connections; resolves once
    // the last active request has been answered.
    server.close(() => { resolve() })
  })
  // A request that finishes after close() leaves its keep-alive connection
  // idle but open, which would hold shutdown until the client gives up on it.
  const sweep = setInterval(() => { server.closeIdleConnections() }, 100)
  let timer: NodeJS.Timeout | undefined
  const deadline = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => { resolve('timeout') }, timeoutMs)
  })

  const outcome = await Promise.race([closed, deadline])
  clearTimeout(timer)
  clearInterval(sweep)
  if (outcome === 'timeout') {
    log.warn('server.shutdown_timeout', { timeoutMs })
    server.closeAllConnections()
    await closed
  }

  log.info('server.stopped')
}
