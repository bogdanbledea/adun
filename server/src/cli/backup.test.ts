import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { tempDatabase, tempDir } from '../../test/helpers.ts'

const script = path.join(import.meta.dirname, 'backup.ts')

test('writes a copy into the backups folder of the data directory', () => {
  const { db, dataDir } = tempDatabase()
  db.close()
  const output = execFileSync(process.execPath, [script], { env: { ADUN_DATA_DIR: dataDir }, encoding: 'utf8' })
  const [file] = fs.readdirSync(path.join(dataDir, 'backups'))
  assert.match(file ?? '', /^adun-\d{8}-\d{6}Z\.sqlite$/)
  assert.ok(output.includes(path.join(fs.realpathSync(dataDir), 'backups', file ?? '')))
})

test('refuses when there is no database, instead of creating an empty one', () => {
  const dataDir = tempDir()
  const result = spawnSync(process.execPath, [script], { env: { ADUN_DATA_DIR: dataDir }, encoding: 'utf8' })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /No database at/)
  assert.deepEqual(fs.readdirSync(dataDir), [])
})
