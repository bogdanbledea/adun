import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { describe, test } from 'node:test'
import { tempDir } from '../test/helpers.ts'
import { migrate, MigrationError, openDatabase, transaction, type Database } from './db.ts'

function setup(files: Record<string, string>) {
  const migrationsDir = tempDir()
  for (const [name, sql] of Object.entries(files)) fs.writeFileSync(path.join(migrationsDir, name), sql)
  const db = openDatabase(tempDir())
  const addMigration = (name: string, sql: string) => {
    fs.writeFileSync(path.join(migrationsDir, name), sql)
  }
  const run = () => migrate(db, migrationsDir)
  return { db, addMigration, run }
}

const tables = (db: Database) =>
  db
    .prepare("SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name")
    .all()
    .map((row) => row.name)

const versions = (db: Database) =>
  db
    .prepare('SELECT version FROM schema_migrations ORDER BY version')
    .all()
    .map((row) => row.version)

describe('openDatabase', () => {
  test('sets the pragmas', () => {
    const { db } = setup({})
    assert.equal(db.prepare('PRAGMA journal_mode').get()?.journal_mode, 'wal')
    assert.equal(db.prepare('PRAGMA foreign_keys').get()?.foreign_keys, 1)
    assert.equal(db.prepare('PRAGMA busy_timeout').get()?.timeout, 5000)
    assert.equal(db.prepare('PRAGMA synchronous').get()?.synchronous, 1) // NORMAL
    db.close()
  })

  test('keeps the data directory and database private', () => {
    const dataDir = path.join(tempDir(), 'data')
    const db = openDatabase(dataDir)
    db.exec('CREATE TABLE t (x INTEGER) STRICT; INSERT INTO t VALUES (1)')
    assert.equal(fs.statSync(dataDir).mode & 0o777, 0o700)
    for (const file of fs.readdirSync(dataDir)) {
      assert.equal(fs.statSync(path.join(dataDir, file)).mode & 0o777, 0o600, file)
    }
    db.close()
  })
})

describe('migrate', () => {
  test('applies migrations once, in order, and is idempotent', () => {
    const { db, run } = setup({
      '0002_b.sql': 'CREATE TABLE b (a_id INTEGER NOT NULL REFERENCES a (id)) STRICT;',
      '0001_a.sql': 'CREATE TABLE a (id INTEGER PRIMARY KEY) STRICT; INSERT INTO a VALUES (1);',
    })

    assert.deepEqual(run(), ['0001_a.sql', '0002_b.sql'])
    assert.deepEqual(tables(db), ['a', 'b', 'schema_migrations'])
    assert.deepEqual(versions(db), [1, 2])

    assert.deepEqual(run(), [])
    assert.deepEqual(versions(db), [1, 2])
    assert.equal(db.prepare('SELECT count(*) AS n FROM a').get()?.n, 1)
    db.close()
  })

  test('applies only what is new', () => {
    const { db, addMigration, run } = setup({ '0001_a.sql': 'CREATE TABLE a (id INTEGER PRIMARY KEY) STRICT;' })
    run()
    addMigration('0002_b.sql', 'CREATE TABLE b (id INTEGER PRIMARY KEY) STRICT;')
    assert.deepEqual(run(), ['0002_b.sql'])
    db.close()
  })

  test('a failing migration leaves the database unchanged and stops the run', () => {
    const { db, addMigration, run } = setup({
      '0001_a.sql': 'CREATE TABLE a (id INTEGER PRIMARY KEY) STRICT; INSERT INTO a VALUES (1);',
    })
    run()
    addMigration(
      '0002_broken.sql',
      'CREATE TABLE half (id INTEGER) STRICT; INSERT INTO a VALUES (2); INSERT INTO a VALUES (1);',
    )
    addMigration('0003_after.sql', 'CREATE TABLE after (id INTEGER) STRICT;')

    assert.throws(run, (error: unknown) => {
      return error instanceof MigrationError && error.message.includes('0002_broken.sql')
    })
    assert.deepEqual(tables(db), ['a', 'schema_migrations'])
    assert.deepEqual(versions(db), [1])
    assert.deepEqual(
      db.prepare('SELECT id FROM a').all().map((row) => row.id),
      [1],
    )
    assert.equal(db.isTransaction, false)
    db.close()
  })

  test('refuses badly named or duplicate migration files', () => {
    const bad = setup({ '1_a.sql': 'SELECT 1;' })
    assert.throws(bad.run, /not understood: 1_a\.sql/)
    bad.db.close()

    const duplicate = setup({ '0001_a.sql': 'SELECT 1;', '0001_b.sql': 'SELECT 1;' })
    assert.throws(duplicate.run, /share the number 1/)
    duplicate.db.close()
  })

  test('the real migrations folder applies cleanly', () => {
    const db = openDatabase(tempDir())
    migrate(db)
    assert.deepEqual(migrate(db), [])
    db.close()
  })
})

describe('transaction', () => {
  test('commits on success and rolls back on error', () => {
    const { db } = setup({})
    db.exec('CREATE TABLE t (x INTEGER) STRICT')

    assert.equal(
      transaction(db, () => db.prepare('INSERT INTO t VALUES (1)').run().changes),
      1,
    )
    assert.throws(() => {
      transaction(db, () => {
        db.exec('INSERT INTO t VALUES (2)')
        throw new Error('stop')
      })
    }, /stop/)

    assert.deepEqual(
      db.prepare('SELECT x FROM t').all().map((row) => row.x),
      [1],
    )
    db.close()
  })

  test('a nested call joins the outer transaction', () => {
    const { db } = setup({})
    db.exec('CREATE TABLE t (x INTEGER) STRICT')
    assert.throws(() => {
      transaction(db, () => {
        transaction(db, () => {
          db.exec('INSERT INTO t VALUES (1)')
        })
        throw new Error('outer fails')
      })
    })
    assert.equal(db.prepare('SELECT count(*) AS n FROM t').get()?.n, 0)
    db.close()
  })
})
