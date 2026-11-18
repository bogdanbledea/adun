/* One JSON object per line on stdout. Callers pass an event name and plain
   fields: IDs, counts, statuses, durations. Never bodies, headers, cookies,
   email addresses, tokens or amounts. */

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const
export type LogLevel = (typeof LOG_LEVELS)[number]

export type LogFields = Record<string, string | number | boolean | null | undefined>

export interface Logger {
  debug(event: string, fields?: LogFields): void
  info(event: string, fields?: LogFields): void
  warn(event: string, fields?: LogFields): void
  error(event: string, fields?: LogFields): void
}

export function createLogger(
  level: LogLevel,
  write: (line: string) => void = (line) => process.stdout.write(line),
): Logger {
  const threshold = LOG_LEVELS.indexOf(level)

  const emit = (at: LogLevel) => (event: string, fields?: LogFields) => {
    if (LOG_LEVELS.indexOf(at) < threshold) return
    write(JSON.stringify({ time: new Date().toISOString(), level: at, event, ...fields }) + '\n')
  }

  return { debug: emit('debug'), info: emit('info'), warn: emit('warn'), error: emit('error') }
}

// For tests that should stay quiet.
export const silentLogger: Logger = createLogger('error', () => undefined)
