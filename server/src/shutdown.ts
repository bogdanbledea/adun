import type { Server } from 'node:http'
import { closeDatabase, type Database } from './db.ts'
import type { Logger } from './lib/log.ts'

export interface ShutdownDeps {
  server: Server
  db: Database
  log: Logger
  // How long in-flight requests may take before their connections are cut.
  timeoutMs?: number
}

/* Graceful shutdown, on SIGTERM (docker stop) or SIGINT: stop accepting
   connections, let requests already in progress finish, then checkpoint the
   WAL into the database file and close it. */
export async function shutdown({ server, db, log, timeoutMs = 10_000 }: ShutdownDeps): Promise<void> {
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
    log.warn({ timeoutMs }, 'server.shutdown_timeout')
    server.closeAllConnections()
    await closed
  }

  closeDatabase(db)
  log.info('server.stopped')
}
