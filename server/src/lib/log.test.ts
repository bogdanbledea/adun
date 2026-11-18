import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createLogger } from './log.ts'

test('writes one JSON line per event at or above the level', () => {
  const lines: string[] = []
  const log = createLogger('info', (line) => lines.push(line))
  log.debug('hidden')
  log.info('shown', { count: 2 })
  log.error('also.shown')
  assert.equal(lines.length, 2)
  assert.ok(lines.every((line) => line.endsWith('\n')))
  const first = JSON.parse(lines[0] ?? '') as Record<string, unknown>
  assert.equal(first.level, 'info')
  assert.equal(first.event, 'shown')
  assert.equal(first.count, 2)
  assert.match(String(first.time), /^\d{4}-\d{2}-\d{2}T/)
})
