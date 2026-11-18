import path from 'node:path'
import { LOG_LEVELS, type LogLevel } from './lib/log.ts'

/* Every environment variable the server reads, parsed once at startup. An
   invalid value stops the process with a message naming the variable. */

export interface Config {
  production: boolean
  // Origin only, without a trailing slash, e.g. https://adun.example.com.
  appUrl: string
  // Absolute path of the folder that holds adun.sqlite.
  dataDir: string
  port: number
  // How many reverse proxies sit in front; decides which address is the client's.
  trustProxyHops: number
  // Turn off once the household's accounts exist.
  registrationsEnabled: boolean
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

function boolean(env: Env, name: string, fallback: boolean): boolean {
  const raw = read(env, name)
  if (raw === undefined) return fallback
  if (raw === 'true') return true
  if (raw === 'false') return false
  throw new ConfigError(`${name} must be true or false`)
}

function appUrl(env: Env, production: boolean): string {
  const raw = read(env, 'APP_URL')
  if (raw === undefined) {
    if (production) throw new ConfigError('APP_URL is required in production')
    return 'http://localhost:5173'
  }
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new ConfigError('APP_URL must be a URL such as https://adun.example.com')
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new ConfigError('APP_URL must start with https:// or http://')
  }
  if (production && url.protocol !== 'https:') {
    throw new ConfigError('APP_URL must use https:// in production')
  }
  if (url.pathname !== '/' || url.search !== '' || url.hash !== '' || url.username !== '') {
    throw new ConfigError('APP_URL must be an origin only, such as https://adun.example.com')
  }
  return url.origin
}

function logLevel(env: Env): LogLevel {
  const raw = read(env, 'LOG_LEVEL') ?? 'info'
  if (!(LOG_LEVELS as readonly string[]).includes(raw)) {
    throw new ConfigError(`LOG_LEVEL must be one of ${LOG_LEVELS.join(', ')}`)
  }
  return raw as LogLevel
}

export function loadConfig(env: Env): Config {
  const production = env.NODE_ENV === 'production'
  return {
    production,
    appUrl: appUrl(env, production),
    dataDir: path.resolve(read(env, 'ADUN_DATA_DIR') ?? 'data'),
    port: integer(env, 'PORT', 8080, 1, 65535),
    trustProxyHops: integer(env, 'TRUST_PROXY_HOPS', 0, 0, 10),
    registrationsEnabled: boolean(env, 'REGISTRATIONS_ENABLED', true),
    logLevel: logLevel(env),
  }
}
