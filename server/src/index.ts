import { createApp } from './app.ts'
import { ConfigError, loadConfig } from './config.ts'
import { migrate, MigrationError, openDatabase } from './db.ts'
import { createLogger } from './lib/log.ts'
import { shutdown } from './shutdown.ts'

// Read config → open db → migrate → build app → listen. On SIGTERM or
// SIGINT, shut down gracefully (shutdown.ts).

let config
try {
  config = loadConfig(process.env)
} catch (error) {
  if (!(error instanceof ConfigError)) throw error
  console.error(`Configuration error: ${error.message}`)
  process.exit(1)
}

const log = createLogger(config.logLevel)
const db = openDatabase(config.dataDir)

try {
  const applied = migrate(db)
  if (applied.length > 0) log.info({ count: applied.length, latest: applied.at(-1) }, 'db.migrated')
} catch (error) {
  if (!(error instanceof MigrationError)) throw error
  log.error({ err: error }, 'db.migration_failed')
  db.close()
  process.exit(1)
}

const server = createApp({ db, log }).listen(config.port, () => {
  log.info({ port: config.port, production: config.production }, 'server.listening')
})

let stopping = false
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    if (stopping) return
    stopping = true
    log.info({ signal }, 'server.stopping')
    shutdown({ server, db, log }).then(
      () => process.exit(0),
      (error: unknown) => {
        log.error({ err: error }, 'server.shutdown_failed')
        process.exit(1)
      },
    )
  })
}
