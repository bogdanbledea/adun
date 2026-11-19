import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { describe, test } from 'node:test'
import { tempDir } from '../test/helpers.ts'
import { backupDatabase, migrate, openDatabase } from './db.ts'
import { restoreDatabase, RestoreError } from './restore.ts'

function migrations(files: Record<string, string>): string {
  const dir = tempDir()
  for (const [name, sql] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), sql)
  return dir
}

const twoMigrations = () =>
  migrations({
    '0001_a.sql': 'CREATE TABLE a (x INTEGER) STRICT;',
    '0002_b.sql': 'CREATE TABLE b (x INTEGER) STRICT;',
  })

// A data folder whose database holds one row with the given value, and a
// backup taken of it.
function dataWithBackup(migrationsDir: string, value: number) {
  const dataDir = tempDir()
  const db = openDatabase(dataDir)
  migrate(db, migrationsDir)
  db.prepare('INSERT INTO a VALUES (?)').run(value)
  const backup = backupDatabase(db, 'adun')
  db.close()
  return { dataDir, backup }
}

const valueIn = (file: string) => {
  const db = new DatabaseSync(file, { readOnly: true })
  const value = db.prepare('SELECT x FROM a').get()?.x
  db.close()
  return value
}

const refused = (message: RegExp) => (error: unknown) => error instanceof RestoreError && message.test(error.message)

describe('restoreDatabase', () => {
  test('puts the backup in place and keeps the database it replaces', () => {
    const migrationsDir = twoMigrations()
    const { backup } = dataWithBackup(migrationsDir, 1)
    const { dataDir } = dataWithBackup(migrationsDir, 2)

    const { migration, saved } = restoreDatabase(dataDir, backup, migrationsDir)
    assert.equal(migration, '0002_b.sql')
    assert.equal(valueIn(path.join(dataDir, 'adun.sqlite')), 1)
    assert.ok(saved)
    assert.match(path.basename(saved), /^pre-restore-\d{8}-\d{6}Z\.sqlite$/)
    assert.equal(valueIn(saved), 2)
    assert.equal(fs.statSync(path.join(dataDir, 'adun.sqlite')).mode & 0o777, 0o600)
    assert.deepEqual(
      fs.readdirSync(dataDir).filter((name) => name.startsWith('adun.sqlite')),
      ['adun.sqlite'],
    )
  })

  test('restores into an empty data folder', () => {
    const migrationsDir = twoMigrations()
    const { backup } = dataWithBackup(migrationsDir, 1)
    const dataDir = path.join(tempDir(), 'new')

    assert.equal(restoreDatabase(dataDir, backup, migrationsDir).saved, null)
    assert.equal(fs.statSync(dataDir).mode & 0o777, 0o700)
    assert.equal(valueIn(path.join(dataDir, 'adun.sqlite')), 1)
  })

  test('accepts a backup that lacks newer migrations; they run at the next start', () => {
    const { backup } = dataWithBackup(migrations({ '0001_a.sql': 'CREATE TABLE a (x INTEGER) STRICT;' }), 1)
    const migrationsDir = twoMigrations()
    const dataDir = tempDir()

    assert.equal(restoreDatabase(dataDir, backup, migrationsDir).migration, '0001_a.sql')
    const db = openDatabase(dataDir)
    assert.deepEqual(migrate(db, migrationsDir).applied, ['0002_b.sql'])
    db.close()
  })

  test('refuses while another connection has the database open', () => {
    const migrationsDir = twoMigrations()
    const { backup } = dataWithBackup(migrationsDir, 1)
    const { dataDir } = dataWithBackup(migrationsDir, 2)
    const server = openDatabase(dataDir)

    assert.throws(() => restoreDatabase(dataDir, backup, migrationsDir), refused(/in use; stop the server/))
    assert.equal(server.prepare('SELECT x FROM a').get()?.x, 2)
    server.close()
    assert.equal(fs.existsSync(path.join(dataDir, 'backups', path.basename(backup))), true)
  })

  test('refuses a backup from a newer version', () => {
    const migrationsDir = twoMigrations()
    const { backup } = dataWithBackup(migrationsDir, 1)
    const older = migrations({ '0001_a.sql': 'CREATE TABLE a (x INTEGER) STRICT;' })

    assert.throws(() => restoreDatabase(tempDir(), backup, older), refused(/newer version of Adun \(it has 0002_b\.sql\)/))
  })

  test('refuses files that are not an Adun database', () => {
    const migrationsDir = twoMigrations()
    const dir = tempDir()
    const text = path.join(dir, 'notes.txt')
    fs.writeFileSync(text, 'hello')
    const other = path.join(dir, 'other.sqlite')
    const otherDb = new DatabaseSync(other)
    otherDb.exec('CREATE TABLE t (x INTEGER)')
    otherDb.close()
    const renamed = dataWithBackup(migrations({ '0001_other.sql': 'CREATE TABLE a (x INTEGER) STRICT;' }), 1)

    assert.throws(() => restoreDatabase(tempDir(), path.join(dir, 'missing'), migrationsDir), refused(/No file/))
    assert.throws(() => restoreDatabase(tempDir(), text, migrationsDir), refused(/Not a SQLite database/))
    assert.throws(() => restoreDatabase(tempDir(), other, migrationsDir), refused(/has no migrations/))
    assert.throws(() => restoreDatabase(tempDir(), renamed.backup, migrationsDir), refused(/0001_other\.sql is not one of ours/))
  })

  test('refuses a damaged backup and leaves the database alone', () => {
    const migrationsDir = twoMigrations()
    const { backup } = dataWithBackup(migrationsDir, 1)
    const { dataDir } = dataWithBackup(migrationsDir, 2)
    const bytes = fs.readFileSync(backup)
    bytes.fill(0xff, 4096, 4096 + 200)
    fs.writeFileSync(backup, bytes)

    assert.throws(() => restoreDatabase(dataDir, backup, migrationsDir), refused(/damaged/))
    assert.equal(valueIn(path.join(dataDir, 'adun.sqlite')), 2)
  })

  test('refuses the database itself', () => {
    const migrationsDir = twoMigrations()
    const { dataDir } = dataWithBackup(migrationsDir, 1)
    const self = path.join(dataDir, 'adun.sqlite')
    assert.throws(() => restoreDatabase(dataDir, self, migrationsDir), refused(/the database itself/))
  })
})
