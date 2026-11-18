import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createLogger, type LogLevel } from './log.ts'

function capture(level: LogLevel) {
  const lines: Record<string, unknown>[] = []
  const log = createLogger(level, { write: (line) => lines.push(JSON.parse(line) as Record<string, unknown>) })
  return { log, lines }
}

test('writes one JSON line per event at or above the level', () => {
  const { log, lines } = capture('info')
  log.debug('hidden')
  log.info({ count: 2 }, 'shown')
  log.error('also.shown')
  assert.equal(lines.length, 2)
  const [first, second] = lines
  assert.equal(first?.level, 'info')
  assert.equal(first.msg, 'shown')
  assert.equal(first.count, 2)
  assert.match(String(first.time), /^\d{4}-\d{2}-\d{2}T/)
  assert.equal(second?.level, 'error')
})

test('redacts secrets', () => {
  const { log, lines } = capture('info')
  log.info({ user: { password: 'hunter2' }, req: { headers: { cookie: 'session=abc' } } }, 'oops')
  const line = JSON.stringify(lines[0])
  assert.doesNotMatch(line, /hunter2|session=abc/)
})

test('logs errors with their stack', () => {
  const { log, lines } = capture('info')
  log.error({ err: new Error('boom') }, 'failed')
  const err = lines[0]?.err as Record<string, unknown>
  assert.equal(err.message, 'boom')
  assert.match(String(err.stack), /Error: boom/)
})
