import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ConfigError, loadConfig } from './config.ts'

function rejects(env: Record<string, string>, variable: string) {
  assert.throws(
    () => loadConfig(env),
    (error: unknown) => error instanceof ConfigError && error.message.includes(variable),
  )
}

test('development defaults', () => {
  assert.deepEqual(loadConfig({}), { production: false, port: 8080, logLevel: 'info' })
})

test('reads every variable', () => {
  const config = loadConfig({ NODE_ENV: 'production', PORT: '3000', LOG_LEVEL: 'warn' })
  assert.deepEqual(config, { production: true, port: 3000, logLevel: 'warn' })
})

test('empty values count as unset', () => {
  assert.equal(loadConfig({ PORT: '', LOG_LEVEL: ' ' }).port, 8080)
})

test('refuses invalid values and names the variable', () => {
  rejects({ PORT: 'eighty' }, 'PORT')
  rejects({ PORT: '70000' }, 'PORT')
  rejects({ PORT: '-1' }, 'PORT')
  rejects({ PORT: '80.5' }, 'PORT')
  rejects({ LOG_LEVEL: 'verbose' }, 'LOG_LEVEL')
})
