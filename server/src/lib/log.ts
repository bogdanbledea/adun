import { pino, type DestinationStream, type Logger } from 'pino'

/* Structured logs: one JSON object per line on stdout (pino-pretty makes them
   readable in development). Log an event name with plain fields, such as
   log.info({ port }, 'server.listening'): IDs, counts, statuses, durations.
   Never bodies, cookies, email addresses, tokens or amounts; the paths below
   are redacted in case one slips through. */

export type { Logger }

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const
export type LogLevel = (typeof LOG_LEVELS)[number]

const REDACT_PATHS = [
  'req.headers.cookie',
  'req.headers.authorization',
  'res.headers["set-cookie"]',
  '*.password',
  '*.token',
]

export function createLogger(level: LogLevel, destination?: DestinationStream): Logger {
  const options = {
    level,
    base: undefined,
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: { level: (label: string) => ({ level: label }) },
    redact: { paths: REDACT_PATHS, censor: '[redacted]' },
  }
  return destination === undefined ? pino(options) : pino(options, destination)
}

// For tests that should stay quiet.
export const silentLogger: Logger = pino({ level: 'silent' })
