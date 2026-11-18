import { createApp } from './app.ts'
import { ConfigError, loadConfig } from './config.ts'
import { createLogger } from './lib/log.ts'
import { shutdown } from './shutdown.ts'

// Read config → build app → listen. On SIGTERM or SIGINT, shut down
// gracefully (shutdown.ts).

let config
try {
  config = loadConfig(process.env)
} catch (error) {
  if (!(error instanceof ConfigError)) throw error
  console.error(`Configuration error: ${error.message}`)
  process.exit(1)
}

const log = createLogger(config.logLevel)

const server = createApp({ log }).listen(config.port, () => {
  log.info({ port: config.port, production: config.production }, 'server.listening')
})

let stopping = false
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    if (stopping) return
    stopping = true
    log.info({ signal }, 'server.stopping')
    shutdown({ server, log }).then(
      () => process.exit(0),
      (error: unknown) => {
        log.error({ err: error }, 'server.shutdown_failed')
        process.exit(1)
      },
    )
  })
}
