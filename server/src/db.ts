import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

export type Database = DatabaseSync

export const DATABASE_FILE = 'adun.sqlite'
export const MIGRATIONS_DIR = path.resolve(import.meta.dirname, '..', 'migrations')

/* Opens (or creates) <dataDir>/adun.sqlite. The process umask is tightened first
   so the directory, the database and its WAL and SHM files are readable by
   this user only (0700 / 0600). */
export function openDatabase(dataDir: string): Database {
  process.umask(0o077)
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 })
  const file = path.join(dataDir, DATABASE_FILE)
  const db = new DatabaseSync(file)
  fs.chmodSync(file, 0o600)
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    PRAGMA synchronous = NORMAL;
  `)
  return db
}

/* Folds the WAL back into adun.sqlite before closing, so the file alone is a
   complete copy once the process has stopped. */
export function closeDatabase(db: Database): void {
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
  db.close()
}

/* Runs fn inside BEGIN IMMEDIATE … COMMIT, rolling back if it throws. A call made
   while a transaction is already open joins it, so services can compose. */
export function transaction<T>(db: Database, fn: () => T): T {
  if (db.isTransaction) return fn()
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

// ── Migrations ───────────────────────────────────────────────────────────────
//
// Plain SQL files named 0001_description.sql, applied in order, each in its own
// transaction and recorded in schema_migrations. Files are append-only: never
// edit one that has shipped. A migration must not contain BEGIN or COMMIT.

export class MigrationError extends Error {
  override name = 'MigrationError'
}

interface MigrationFile {
  version: number
  name: string
  sql: string
}

const MIGRATION_NAME = /^(\d{4})_[a-z0-9_]+\.sql$/

function readMigrations(dir: string): MigrationFile[] {
  const files = fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.sql'))
    .sort()
  const migrations: MigrationFile[] = []
  for (const name of files) {
    const match = MIGRATION_NAME.exec(name)
    if (!match) throw new MigrationError(`Migration file name not understood: ${name}`)
    const version = Number(match[1])
    if (migrations.at(-1)?.version === version) {
      throw new MigrationError(`Two migrations share the number ${String(version)}`)
    }
    migrations.push({ version, name, sql: fs.readFileSync(path.join(dir, name), 'utf8') })
  }
  return migrations
}

/* Applies pending migrations and returns the names of those it applied. A
   failing migration is rolled back and stops the run; nothing is ever reset
   or recreated. */
export function migrate(db: Database, migrationsDir = MIGRATIONS_DIR): string[] {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    ) STRICT
  `)

  const done = new Set(
    db
      .prepare('SELECT version FROM schema_migrations')
      .all()
      .map((row) => row.version as number),
  )
  const pending = readMigrations(migrationsDir).filter((m) => !done.has(m.version))

  const record = db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)')
  const applied: string[] = []
  for (const migration of pending) {
    try {
      transaction(db, () => {
        db.exec(migration.sql)
        record.run(migration.version, migration.name, new Date().toISOString())
      })
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      throw new MigrationError(`Migration ${migration.name} failed: ${reason}`, { cause: error })
    }
    applied.push(migration.name)
  }
  return applied
}
