import path from 'node:path'
import { LOG_LEVELS, type LogLevel } from './lib/log.ts'

/* Every environment variable the server reads, parsed once at startup. An
   invalid value stops the process with a message naming the variable. */

export interface Config {
  production: boolean
  // Absolute path of the folder that holds adun.sqlite.
  dataDir: string
  port: number
  logLevel: LogLevel
}

export class ConfigError extends Error {
  override name = 'ConfigError'
}

type Env = Record<string, string | undefined>

// An empty value counts as unset, so `FOO=` in an env file behaves like no FOO.
function read(env: Env, name: string): string | undefined {
  const value = env[name]?.trim()
  return value === '' ? undefined : value
}

function integer(env: Env, name: string, fallback: number, min: number, max: number): number {
  const raw = read(env, name)
  if (raw === undefined) return fallback
  const value = Number(raw)
  if (!/^\d+$/.test(raw) || value < min || value > max) {
    throw new ConfigError(`${name} must be a whole number from ${String(min)} to ${String(max)}`)
  }
  return value
}

function logLevel(env: Env): LogLevel {
  const raw = read(env, 'LOG_LEVEL') ?? 'info'
  if (!(LOG_LEVELS as readonly string[]).includes(raw)) {
    throw new ConfigError(`LOG_LEVEL must be one of ${LOG_LEVELS.join(', ')}`)
  }
  return raw as LogLevel
}

export function loadConfig(env: Env): Config {
  return {
    production: env.NODE_ENV === 'production',
    dataDir: path.resolve(read(env, 'ADUN_DATA_DIR') ?? 'data'),
    port: integer(env, 'PORT', 8080, 1, 65535),
    logLevel: logLevel(env),
  }
}
