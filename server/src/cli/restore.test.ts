import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import { tempDatabase, tempDir } from '../../test/helpers.ts'
import { backupDatabase } from '../db.ts'

const script = path.join(import.meta.dirname, 'restore.ts')

test('restores a backup read from standard input and leaves no copy of it behind', () => {
  const { db } = tempDatabase()
  db.exec("UPDATE schema_migrations SET applied_at = 'from the backup'")
  const backup = backupDatabase(db, 'adun')
  db.close()
  const dataDir = tempDir()

  const result = spawnSync(process.execPath, [script, '-'], {
    env: { ADUN_DATA_DIR: dataDir },
    input: fs.readFileSync(backup),
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(fs.readdirSync(dataDir), ['adun.sqlite'])
  const restored = new DatabaseSync(path.join(dataDir, 'adun.sqlite'), { readOnly: true })
  assert.equal(restored.prepare('SELECT applied_at FROM schema_migrations LIMIT 1').get()?.applied_at, 'from the backup')
  restored.close()
})

test('says why it refuses, without a stack trace', () => {
  const dataDir = tempDir()
  const result = spawnSync(process.execPath, [script, '-'], {
    env: { ADUN_DATA_DIR: dataDir },
    input: 'not a database',
    encoding: 'utf8',
  })
  assert.equal(result.status, 1)
  assert.equal(result.stderr.trim(), 'Not restored: Not a SQLite database')
  assert.deepEqual(fs.readdirSync(dataDir), [])
})
