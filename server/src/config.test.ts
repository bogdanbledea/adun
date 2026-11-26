import assert from 'node:assert/strict'
import path from 'node:path'
import { test } from 'node:test'
import { ConfigError, loadConfig } from './config.ts'

function rejects(env: Record<string, string>, variable: string) {
  assert.throws(
    () => loadConfig(env),
    (error: unknown) => error instanceof ConfigError && error.message.includes(variable),
  )
}

const RECIPIENT = 'age1ql3z7hjy54pw3hyww5ayyfg7zqgvc7w3j2elw8zmrj2kg5sfn9aqmcac8p'

test('development defaults', () => {
  assert.deepEqual(loadConfig({}), {
    production: false,
    appUrl: 'http://localhost:5173',
    dataDir: path.resolve('data'),
    port: 8080,
    trustProxyHops: 0,
    registrationsEnabled: true,
    email: null,
    backup: { dir: path.resolve('data', 'backups'), intervalHours: 24, keep: 7, offsite: null },
    timeZone: 'Europe/Bucharest',
    logLevel: 'info',
  })
})

test('reads every variable', () => {
  const config = loadConfig({
    NODE_ENV: 'production',
    APP_URL: 'https://adun.example.com/',
    ADUN_DATA_DIR: '/data',
    PORT: '3000',
    TRUST_PROXY_HOPS: '1',
    REGISTRATIONS_ENABLED: 'false',
    SMTP_HOST: 'smtp.example.com',
    SMTP_PORT: '465',
    SMTP_USER: 'adun',
    SMTP_PASSWORD: 'secret',
    EMAIL_FROM: 'adun@example.com',
    EMAIL_FROM_NAME: 'Adun',
    BACKUP_DIR: '/backups',
    BACKUP_INTERVAL_HOURS: '6',
    BACKUP_KEEP: '28',
    BACKUP_S3_ENDPOINT: 'https://s3.example.com',
    BACKUP_S3_REGION: 'eu-central-1',
    BACKUP_S3_BUCKET: 'adun-backups',
    BACKUP_S3_PREFIX: '/home/',
    BACKUP_S3_ACCESS_KEY_ID: 'key-id',
    BACKUP_S3_SECRET_ACCESS_KEY: 'key-secret',
    BACKUP_AGE_RECIPIENT: RECIPIENT,
    TIME_ZONE: 'America/New_York',
    LOG_LEVEL: 'warn',
  })
  assert.deepEqual(config, {
    production: true,
    appUrl: 'https://adun.example.com',
    dataDir: '/data',
    port: 3000,
    trustProxyHops: 1,
    registrationsEnabled: false,
    email: {
      host: 'smtp.example.com',
      port: 465,
      user: 'adun',
      password: 'secret',
      fromAddress: 'adun@example.com',
      fromName: 'Adun',
    },
    backup: {
      dir: '/backups',
      intervalHours: 6,
      keep: 28,
      offsite: {
        target: {
          endpoint: 'https://s3.example.com',
          region: 'eu-central-1',
          bucket: 'adun-backups',
          accessKeyId: 'key-id',
          secretAccessKey: 'key-secret',
        },
        prefix: 'home',
        ageRecipient: RECIPIENT,
      },
    },
    timeZone: 'America/New_York',
    logLevel: 'warn',
  })
})

test('empty values count as unset', () => {
  const config = loadConfig({ PORT: '', LOG_LEVEL: ' ', ADUN_DATA_DIR: '', APP_URL: '' })
  assert.equal(config.port, 8080)
  assert.equal(config.dataDir, path.resolve('data'))
  assert.equal(config.appUrl, 'http://localhost:5173')
})

test('refuses invalid values and names the variable', () => {
  rejects({ NODE_ENV: 'production' }, 'APP_URL')
  rejects({ NODE_ENV: 'production', APP_URL: 'http://adun.example.com' }, 'APP_URL')
  rejects({ APP_URL: 'adun.example.com' }, 'APP_URL')
  rejects({ APP_URL: 'https://adun.example.com/app' }, 'APP_URL')
  rejects({ APP_URL: 'ftp://adun.example.com' }, 'APP_URL')
  rejects({ PORT: 'eighty' }, 'PORT')
  rejects({ PORT: '70000' }, 'PORT')
  rejects({ PORT: '-1' }, 'PORT')
  rejects({ PORT: '80.5' }, 'PORT')
  rejects({ TRUST_PROXY_HOPS: '1.5' }, 'TRUST_PROXY_HOPS')
  rejects({ TRUST_PROXY_HOPS: '11' }, 'TRUST_PROXY_HOPS')
  rejects({ REGISTRATIONS_ENABLED: 'yes' }, 'REGISTRATIONS_ENABLED')
  rejects({ LOG_LEVEL: 'verbose' }, 'LOG_LEVEL')
  rejects({ TIME_ZONE: 'Europe/Nowhere' }, 'TIME_ZONE')
  rejects({ BACKUPS_ENABLED: 'no' }, 'BACKUPS_ENABLED')
  rejects({ BACKUP_INTERVAL_HOURS: '0' }, 'BACKUP_INTERVAL_HOURS')
  rejects({ BACKUP_INTERVAL_HOURS: '169' }, 'BACKUP_INTERVAL_HOURS')
  rejects({ BACKUP_KEEP: '0' }, 'BACKUP_KEEP')
})

test('backups: the default folder follows the data folder, and false turns them off', () => {
  assert.equal(loadConfig({ ADUN_DATA_DIR: '/data' }).backup?.dir, path.join('/data', 'backups'))
  assert.equal(loadConfig({ BACKUPS_ENABLED: 'false', BACKUP_KEEP: '3' }).backup, null)
})

test('email: a relay without sign-in, on the default port, with the default name', () => {
  assert.deepEqual(loadConfig({ SMTP_HOST: 'localhost', EMAIL_FROM: 'adun@example.com' }).email, {
    host: 'localhost',
    port: 587,
    user: null,
    password: null,
    fromAddress: 'adun@example.com',
    fromName: 'adun',
  })
})

test('email: half a setup stops startup', () => {
  rejects({ EMAIL_FROM: 'adun@example.com' }, 'SMTP_HOST')
  rejects({ SMTP_PASSWORD: 'secret' }, 'SMTP_HOST')
  rejects({ SMTP_HOST: 'smtp.example.com' }, 'EMAIL_FROM')
  rejects({ SMTP_HOST: 'smtp.example.com', EMAIL_FROM: 'nobody' }, 'EMAIL_FROM')
  rejects({ SMTP_HOST: 'smtp.example.com', EMAIL_FROM: 'adun@example.com', SMTP_USER: 'adun' }, 'SMTP_PASSWORD')
  rejects({ SMTP_HOST: 'smtp.example.com', EMAIL_FROM: 'adun@example.com', SMTP_PORT: 'smtp' }, 'SMTP_PORT')
})

test('backups: uploads need the bucket, the keys and an age recipient', () => {
  const s3 = {
    BACKUP_S3_ENDPOINT: 'https://s3.example.com',
    BACKUP_S3_BUCKET: 'adun-backups',
    BACKUP_S3_ACCESS_KEY_ID: 'key-id',
    BACKUP_S3_SECRET_ACCESS_KEY: 'key-secret',
    BACKUP_AGE_RECIPIENT: RECIPIENT,
  }
  const offsite = loadConfig(s3).backup?.offsite
  assert.equal(offsite?.target.region, 'auto')
  assert.equal(offsite.prefix, '')

  rejects({ BACKUP_S3_ENDPOINT: 'https://s3.example.com' }, 'BACKUP_S3_BUCKET')
  rejects({ BACKUP_AGE_RECIPIENT: RECIPIENT }, 'BACKUP_S3_BUCKET')
  rejects({ ...s3, BACKUP_S3_ENDPOINT: '' }, 'BACKUP_S3_ENDPOINT')
  rejects({ ...s3, BACKUP_S3_ENDPOINT: 'https://s3.example.com/adun-backups' }, 'BACKUP_S3_ENDPOINT')
  rejects({ ...s3, NODE_ENV: 'production', APP_URL: 'https://adun.example.com', BACKUP_S3_ENDPOINT: 'http://s3.example.com' }, 'BACKUP_S3_ENDPOINT')
  rejects({ ...s3, BACKUP_S3_SECRET_ACCESS_KEY: '' }, 'BACKUP_S3_SECRET_ACCESS_KEY')
  rejects({ ...s3, BACKUP_AGE_RECIPIENT: '' }, 'BACKUP_AGE_RECIPIENT')
  rejects({ ...s3, BACKUP_AGE_RECIPIENT: 'AGE-SECRET-KEY-1QQQ' }, 'BACKUP_AGE_RECIPIENT')
})
