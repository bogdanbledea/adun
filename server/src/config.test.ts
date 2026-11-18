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
    dataDir: path.resolve('data'),
    port: 8080,
    logLevel: 'info',
  })
})

test('reads every variable', () => {
  const config = loadConfig({ NODE_ENV: 'production', ADUN_DATA_DIR: '/data', PORT: '3000', LOG_LEVEL: 'warn' })
  assert.deepEqual(config, { production: true, dataDir: '/data', port: 3000, logLevel: 'warn' })
})

test('empty values count as unset', () => {
  const config = loadConfig({ PORT: '', LOG_LEVEL: ' ', ADUN_DATA_DIR: '' })
  assert.equal(config.port, 8080)
  assert.equal(config.dataDir, path.resolve('data'))
})

test('refuses invalid values and names the variable', () => {
  rejects({ PORT: 'eighty' }, 'PORT')
  rejects({ PORT: '70000' }, 'PORT')
  rejects({ PORT: '-1' }, 'PORT')
  rejects({ PORT: '80.5' }, 'PORT')
  rejects({ LOG_LEVEL: 'verbose' }, 'LOG_LEVEL')
})
