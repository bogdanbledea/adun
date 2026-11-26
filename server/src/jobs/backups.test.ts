import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { ConfigError } from '../config.ts'
import { captureLogger, tempDatabase, tempDir } from '../../test/helpers.ts'
import { msUntilDue, prepareBackupDir, runScheduledBackup, startScheduledBackups } from './backups.ts'

const HOUR = 60 * 60 * 1000
const NOW = Date.parse('2026-11-26T12:00:00Z')

function setup(keep = 3) {
  const { db } = tempDatabase()
  const dir = path.join(tempDir(), 'backups')
  fs.mkdirSync(dir)
  return { db, backup: { dir, intervalHours: 6, keep } }
}

const touch = (dir: string, name: string) => {
  fs.writeFileSync(path.join(dir, name), '')
}

test('writes a readable copy into the backup folder', () => {
  const { db, backup } = setup()
  db.prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (9999, 'marker', '')").run()

  const { file } = runScheduledBackup(db, backup, new Date(NOW))

  assert.equal(file, path.join(backup.dir, 'auto-20261126-120000Z.sqlite'))
  const copy = new DatabaseSync(file, { readOnly: true })
  assert.ok(copy.prepare('SELECT 1 FROM schema_migrations WHERE version = 9999').get())
  copy.close()
})

test('keeps only the newest copies, and leaves other files alone', () => {
  const { db, backup } = setup(2)
  touch(backup.dir, 'auto-20261124-120000Z.sqlite')
  touch(backup.dir, 'auto-20261125-120000Z.sqlite')
  touch(backup.dir, 'adun-20261101-120000Z.sqlite')
  touch(backup.dir, 'notes.txt')

  const { deleted } = runScheduledBackup(db, backup, new Date(NOW))

  assert.equal(deleted, 1)
  assert.deepEqual(fs.readdirSync(backup.dir).sort(), [
    'adun-20261101-120000Z.sqlite',
    'auto-20261125-120000Z.sqlite',
    'auto-20261126-120000Z.sqlite',
    'notes.txt',
  ])
})

test('the next copy is due an interval after the newest one', () => {
  const { backup } = setup()
  assert.equal(msUntilDue(backup, NOW), 0)

  touch(backup.dir, 'auto-20261126-100000Z.sqlite')
  touch(backup.dir, 'auto-20261125-100000Z.sqlite')
  assert.equal(msUntilDue(backup, NOW), 4 * HOUR)

  assert.equal(msUntilDue(backup, NOW + 7 * HOUR), 0)
})

test('a fresh copy in the folder means none at startup', () => {
  const { db, backup } = setup()
  const { log, lines } = captureLogger()
  runScheduledBackup(db, backup)

  const stop = startScheduledBackups(db, backup, log)
  stop()

  assert.equal(fs.readdirSync(backup.dir).length, 1)
  assert.equal(lines.length, 0)
})

test('takes a copy at startup when none is there, and logs only its name', () => {
  const { db, backup } = setup()
  const { log, lines } = captureLogger()

  const stop = startScheduledBackups(db, backup, log)
  stop()

  const [file] = fs.readdirSync(backup.dir)
  assert.match(file ?? '', /^auto-\d{8}-\d{6}Z\.sqlite$/)
  assert.deepEqual(
    lines.map((line) => [line.msg, line.file, line.deleted]),
    [['backup.created', file, 0]],
  )
})

test('a failed copy is logged and does not stop the server', () => {
  const { db, backup } = setup()
  const { log, lines } = captureLogger()
  fs.rmSync(backup.dir, { recursive: true })
  touch(path.dirname(backup.dir), 'backups')

  const stop = startScheduledBackups(db, backup, log)
  stop()

  assert.deepEqual(
    lines.map((line) => line.msg),
    ['backup.failed'],
  )
})

test('a folder that cannot be written to stops startup, naming BACKUP_DIR', () => {
  const parent = tempDir()
  touch(parent, 'file')
  assert.throws(
    () => {
      prepareBackupDir(path.join(parent, 'file', 'backups'))
    },
    (error: unknown) => error instanceof ConfigError && error.message.includes('BACKUP_DIR'),
  )

  const dir = path.join(parent, 'new', 'backups')
  prepareBackupDir(dir)
  assert.ok(fs.statSync(dir).isDirectory())
})
