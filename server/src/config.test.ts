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

test('development defaults', () => {
  assert.deepEqual(loadConfig({}), {
    production: false,
    appUrl: 'http://localhost:5173',
    dataDir: path.resolve('data'),
    port: 8080,
    trustProxyHops: 0,
    registrationsEnabled: true,
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
    LOG_LEVEL: 'warn',
  })
  assert.deepEqual(config, {
    production: true,
    appUrl: 'https://adun.example.com',
    dataDir: '/data',
    port: 3000,
    trustProxyHops: 1,
    registrationsEnabled: false,
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
})
