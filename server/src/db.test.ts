import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { describe, test } from 'node:test'
import { tempDir } from '../test/helpers.ts'
import { DatabaseSync } from 'node:sqlite'
import { backupDatabase, migrate, MigrationError, openDatabase, transaction, type Database } from './db.ts'

function setup(files: Record<string, string>) {
  const migrationsDir = tempDir()
  for (const [name, sql] of Object.entries(files)) fs.writeFileSync(path.join(migrationsDir, name), sql)
  const dataDir = tempDir()
  const db = openDatabase(dataDir)
  const addMigration = (name: string, sql: string) => {
    fs.writeFileSync(path.join(migrationsDir, name), sql)
  }
  const run = () => migrate(db, migrationsDir).applied
  return { db, dataDir, migrationsDir, addMigration, run }
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

  test('a migration can rebuild a table without losing the rows that point at it', () => {
    const { db, addMigration, run } = setup({
      '0001_a.sql': `
        CREATE TABLE a (id INTEGER PRIMARY KEY, name TEXT NOT NULL) STRICT;
        CREATE TABLE b (a_id INTEGER NOT NULL REFERENCES a (id) ON DELETE CASCADE) STRICT;
        INSERT INTO a VALUES (1, 'one');
        INSERT INTO b VALUES (1);`,
    })
    run()
    addMigration(
      '0002_rebuild_a.sql',
      `CREATE TABLE a_new (id INTEGER PRIMARY KEY, name TEXT) STRICT;
       INSERT INTO a_new SELECT id, name FROM a;
       DROP TABLE a;
       ALTER TABLE a_new RENAME TO a;`,
    )
    assert.deepEqual(run(), ['0002_rebuild_a.sql'])
    assert.equal(db.prepare('SELECT count(*) AS n FROM b').get()?.n, 1)
    assert.equal(db.prepare('PRAGMA foreign_keys').get()?.foreign_keys, 1)
    assert.throws(() => {
      db.exec('INSERT INTO b VALUES (2)')
    }, /FOREIGN KEY constraint failed/)
    db.close()
  })

  test('a migration that leaves a row pointing nowhere is rolled back', () => {
    const { db, addMigration, run } = setup({
      '0001_a.sql': `
        CREATE TABLE a (id INTEGER PRIMARY KEY) STRICT;
        CREATE TABLE b (a_id INTEGER NOT NULL REFERENCES a (id)) STRICT;
        INSERT INTO a VALUES (1);
        INSERT INTO b VALUES (1);`,
    })
    run()
    addMigration('0002_drop_a.sql', 'DROP TABLE a; CREATE TABLE a (id INTEGER PRIMARY KEY) STRICT;')
    assert.throws(run, /0002_drop_a\.sql failed: a row in b points at a missing a row/)
    assert.deepEqual(versions(db), [1])
    assert.equal(db.prepare('SELECT count(*) AS n FROM a').get()?.n, 1)
    assert.equal(db.prepare('PRAGMA foreign_keys').get()?.foreign_keys, 1)
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
    assert.deepEqual(migrate(db), { applied: [], backup: null })
    db.close()
  })
})

const backups = (dataDir: string) => fs.readdirSync(path.join(dataDir, 'backups')).sort()

describe('backupDatabase', () => {
  test('writes a private copy that opens on its own', () => {
    const { db, dataDir } = setup({})
    db.exec('CREATE TABLE t (x INTEGER) STRICT; INSERT INTO t VALUES (1)')
    const file = backupDatabase(db, 'adun', new Date('2026-11-19T14:30:05.123Z'))
    db.close()

    assert.equal(file, path.join(fs.realpathSync(dataDir), 'backups', 'adun-20261119-143005Z.sqlite'))
    assert.equal(fs.statSync(path.dirname(file)).mode & 0o777, 0o700)
    assert.equal(fs.statSync(file).mode & 0o777, 0o600)
    const copy = new DatabaseSync(file, { readOnly: true })
    assert.equal(copy.prepare('SELECT x FROM t').get()?.x, 1)
    copy.close()
  })

  test('leaves out what another connection has not committed', () => {
    const { db, dataDir } = setup({})
    db.exec('CREATE TABLE t (x INTEGER) STRICT; INSERT INTO t VALUES (1)')
    const writer = new DatabaseSync(path.join(dataDir, 'adun.sqlite'))
    writer.exec('BEGIN; INSERT INTO t VALUES (2)')
    const file = backupDatabase(db, 'adun')
    writer.exec('COMMIT')
    writer.close()
    db.close()

    const copy = new DatabaseSync(file, { readOnly: true })
    assert.deepEqual(
      copy.prepare('SELECT x FROM t').all().map((row) => row.x),
      [1],
    )
    copy.close()
  })

  test('keeps the five newest copies taken before migrations, and every other copy', () => {
    const { db, dataDir } = setup({})
    backupDatabase(db, 'adun', new Date('2026-01-01T00:00:00Z'))
    for (let day = 1; day <= 7; day++) {
      backupDatabase(db, `pre-migration-000${String(day)}`, new Date(`2026-02-0${String(day)}T00:00:00Z`))
    }
    db.close()
    assert.deepEqual(backups(dataDir), [
      'adun-20260101-000000Z.sqlite',
      'pre-migration-0003-20260203-000000Z.sqlite',
      'pre-migration-0004-20260204-000000Z.sqlite',
      'pre-migration-0005-20260205-000000Z.sqlite',
      'pre-migration-0006-20260206-000000Z.sqlite',
      'pre-migration-0007-20260207-000000Z.sqlite',
    ])
  })
})

describe('migrate backups', () => {
  test('copies the database before changing its schema', () => {
    const { db, dataDir, migrationsDir, addMigration } = setup({
      '0001_a.sql': 'CREATE TABLE a (id INTEGER PRIMARY KEY) STRICT;',
    })
    migrate(db, migrationsDir)
    addMigration('0002_b.sql', 'CREATE TABLE b (id INTEGER PRIMARY KEY) STRICT;')
    addMigration('0003_c.sql', 'CREATE TABLE c (id INTEGER PRIMARY KEY) STRICT;')
    const { applied, backup } = migrate(db, migrationsDir)
    db.close()

    assert.deepEqual(applied, ['0002_b.sql', '0003_c.sql'])
    assert.ok(backup)
    assert.match(path.basename(backup), /^pre-migration-0002-\d{8}-\d{6}Z\.sqlite$/)
    assert.deepEqual(backups(dataDir), [path.basename(backup)])
    const copy = new DatabaseSync(backup, { readOnly: true })
    assert.deepEqual(tables(copy), ['a', 'schema_migrations'])
    copy.close()
  })

  test('takes none for a new database or when nothing is pending', () => {
    const { db, dataDir, migrationsDir } = setup({ '0001_a.sql': 'CREATE TABLE a (id INTEGER PRIMARY KEY) STRICT;' })
    assert.equal(migrate(db, migrationsDir).backup, null)
    assert.equal(migrate(db, migrationsDir).backup, null)
    db.close()
    assert.equal(fs.existsSync(path.join(dataDir, 'backups')), false)
  })

  test('applies nothing when the copy cannot be written', () => {
    const { db, dataDir, migrationsDir, addMigration } = setup({
      '0001_a.sql': 'CREATE TABLE a (id INTEGER PRIMARY KEY) STRICT;',
    })
    migrate(db, migrationsDir)
    addMigration('0002_b.sql', 'CREATE TABLE b (id INTEGER PRIMARY KEY) STRICT;')
    fs.writeFileSync(path.join(dataDir, 'backups'), 'not a folder')

    assert.throws(
      () => migrate(db, migrationsDir),
      (error: unknown) => error instanceof MigrationError && error.message.startsWith('Backup before 0002_b.sql failed'),
    )
    assert.deepEqual(versions(db), [1])
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
