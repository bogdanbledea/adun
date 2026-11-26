import path from 'node:path'
import type { S3Target } from './lib/s3.ts'
import { LOG_LEVELS, type LogLevel } from './lib/log.ts'

/* Every environment variable the server reads, parsed once at startup. An
   invalid value stops the process with a message naming the variable. */

export interface EmailConfig {
  host: string
  port: number
  // Both set, or both null for a relay that needs no sign-in.
  user: string | null
  password: string | null
  fromAddress: string
  fromName: string
}

export interface OffsiteConfig {
  target: S3Target
  // Keys are <prefix>/auto-<UTC time>.sqlite.age, or no prefix and slash.
  prefix: string
  // age public key (age1…) each copy is encrypted to before it leaves.
  ageRecipient: string
}

export interface BackupConfig {
  // Absolute path of the folder the scheduled copies go to.
  dir: string
  intervalHours: number
  // Scheduled copies kept; older ones are deleted.
  keep: number
  // null means the copies stay on this machine only.
  offsite: OffsiteConfig | null
}

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
  // null means email is off.
  email: EmailConfig | null
  // null means no scheduled backups.
  backup: BackupConfig | null
  // IANA name, such as Europe/Bucharest: decides which day it is for the
  // reminder emails, and the hour they go out.
  timeZone: string
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

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const EMAIL_VARIABLES = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD', 'EMAIL_FROM', 'EMAIL_FROM_NAME']

// SMTP_HOST turns email on. Without it, setting any other email variable is a
// mistake worth stopping for, rather than an email that silently never goes.
function email(env: Env): EmailConfig | null {
  const host = read(env, 'SMTP_HOST')
  if (host === undefined) {
    const stray = EMAIL_VARIABLES.filter((name) => read(env, name) !== undefined)
    if (stray.length > 0) throw new ConfigError(`${stray.join(', ')} set without SMTP_HOST; set SMTP_HOST to turn email on`)
    return null
  }

  const fromAddress = read(env, 'EMAIL_FROM')
  if (fromAddress === undefined || !EMAIL_SHAPE.test(fromAddress)) {
    throw new ConfigError('EMAIL_FROM must be the address emails are sent from')
  }
  const user = read(env, 'SMTP_USER') ?? null
  const password = read(env, 'SMTP_PASSWORD') ?? null
  if ((user === null) !== (password === null)) {
    throw new ConfigError('SMTP_USER and SMTP_PASSWORD must be set together')
  }
  return {
    host,
    port: integer(env, 'SMTP_PORT', 587, 1, 65535),
    user,
    password,
    fromAddress,
    fromName: read(env, 'EMAIL_FROM_NAME') ?? 'adun',
  }
}

const OFFSITE_VARIABLES = [
  'BACKUP_S3_ENDPOINT',
  'BACKUP_S3_REGION',
  'BACKUP_S3_PREFIX',
  'BACKUP_S3_ACCESS_KEY_ID',
  'BACKUP_S3_SECRET_ACCESS_KEY',
  'BACKUP_AGE_RECIPIENT',
]

// BACKUP_S3_BUCKET turns uploads on, as SMTP_HOST does email. A copy never
// leaves unencrypted, so the age recipient is required with it.
function offsite(env: Env, production: boolean): OffsiteConfig | null {
  const bucket = read(env, 'BACKUP_S3_BUCKET')
  if (bucket === undefined) {
    const stray = OFFSITE_VARIABLES.filter((name) => read(env, name) !== undefined)
    if (stray.length > 0) throw new ConfigError(`${stray.join(', ')} set without BACKUP_S3_BUCKET; set it to upload backups`)
    return null
  }

  const raw = read(env, 'BACKUP_S3_ENDPOINT')
  let endpoint: URL | undefined
  try {
    endpoint = raw === undefined ? undefined : new URL(raw)
  } catch {
    endpoint = undefined
  }
  const protocols = production ? ['https:'] : ['https:', 'http:']
  if (endpoint === undefined || !protocols.includes(endpoint.protocol) || endpoint.pathname !== '/' || endpoint.search !== '') {
    throw new ConfigError(`BACKUP_S3_ENDPOINT must be the store's ${production ? 'https://' : ''}origin, without the bucket`)
  }
  const accessKeyId = read(env, 'BACKUP_S3_ACCESS_KEY_ID')
  const secretAccessKey = read(env, 'BACKUP_S3_SECRET_ACCESS_KEY')
  if (accessKeyId === undefined || secretAccessKey === undefined) {
    throw new ConfigError('BACKUP_S3_ACCESS_KEY_ID and BACKUP_S3_SECRET_ACCESS_KEY are required with BACKUP_S3_BUCKET')
  }
  const ageRecipient = read(env, 'BACKUP_AGE_RECIPIENT')
  if (ageRecipient === undefined || !/^age1[0-9a-z]+$/.test(ageRecipient)) {
    throw new ConfigError('BACKUP_AGE_RECIPIENT must be an age public key (age1…) with BACKUP_S3_BUCKET')
  }
  return {
    target: { endpoint: endpoint.origin, region: read(env, 'BACKUP_S3_REGION') ?? 'auto', bucket, accessKeyId, secretAccessKey },
    prefix: (read(env, 'BACKUP_S3_PREFIX') ?? '').replace(/^\/+|\/+$/g, ''),
    ageRecipient,
  }
}

// Leaving the other variables set while turning backups off is fine: they are
// ready for when they are turned back on.
function backup(env: Env, dataDir: string, production: boolean): BackupConfig | null {
  if (!boolean(env, 'BACKUPS_ENABLED', true)) return null
  return {
    dir: path.resolve(read(env, 'BACKUP_DIR') ?? path.join(dataDir, 'backups')),
    intervalHours: integer(env, 'BACKUP_INTERVAL_HOURS', 24, 1, 168),
    keep: integer(env, 'BACKUP_KEEP', 7, 1, 1000),
    offsite: offsite(env, production),
  }
}

function timeZone(env: Env): string {
  const raw = read(env, 'TIME_ZONE') ?? 'Europe/Bucharest'
  try {
    new Intl.DateTimeFormat('en', { timeZone: raw })
  } catch {
    throw new ConfigError('TIME_ZONE must be a time zone name such as Europe/Bucharest')
  }
  return raw
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
  const dataDir = path.resolve(read(env, 'ADUN_DATA_DIR') ?? 'data')
  return {
    production,
    appUrl: appUrl(env, production),
    dataDir,
    port: integer(env, 'PORT', 8080, 1, 65535),
    trustProxyHops: integer(env, 'TRUST_PROXY_HOPS', 0, 0, 10),
    registrationsEnabled: boolean(env, 'REGISTRATIONS_ENABLED', true),
    email: email(env),
    backup: backup(env, dataDir, production),
    timeZone: timeZone(env),
    logLevel: logLevel(env),
  }
}
