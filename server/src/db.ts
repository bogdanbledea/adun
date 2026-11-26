import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

export type Database = DatabaseSync

export const DATABASE_FILE = 'adun.sqlite'
export const MIGRATIONS_DIR = path.resolve(import.meta.dirname, '..', 'migrations')

/* Opens (or creates) <dataDir>/adun.sqlite. The process umask is tightened first
   so the directory, the database, its WAL and SHM files and every backup are
   readable by this user only (0700 / 0600). */
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

// ── Backups ──────────────────────────────────────────────────────────────────
//
// Copies go to <dataDir>/backups as <prefix>-<UTC time>.sqlite, so the names
// sort in the order they were taken. `npm run backup` writes adun-…; the
// server writes pre-migration-NNNN-… before it changes the schema, and its
// scheduled copies, auto-…, to BACKUP_DIR (jobs/backups.ts).

export const BACKUPS_DIR = 'backups'

// Older pre-migration copies are deleted; the operator's own are never touched.
const KEEP_PRE_MIGRATION = 5

function fileTimestamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace('T', '-').replace(/\.\d+Z$/, 'Z')
}

/* Writes a consistent copy of the database and returns its path. VACUUM INTO
   reads one snapshot, so the server can keep writing meanwhile, and the copy
   is compacted and needs no WAL file next to it. */
export function backupDatabase(db: Database, prefix: string, now = new Date(), dir = backupsDir(db)): string {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
  const file = path.join(dir, `${prefix}-${fileTimestamp(now)}.sqlite`)
  db.prepare('VACUUM INTO ?').run(file)
  fs.chmodSync(file, 0o600)
  if (prefix.startsWith('pre-migration-')) pruneBackups(dir, 'pre-migration-', KEEP_PRE_MIGRATION)
  return file
}

function backupsDir(db: Database): string {
  const location = db.location()
  if (location === null) throw new Error('An in-memory database has no backups')
  return path.join(path.dirname(location), BACKUPS_DIR)
}

// The copies with this prefix, oldest first. Sorted by the time at the end of
// the name, since the migration number before it can go back down after a restore.
export function listBackups(dir: string, prefix: string): string[] {
  const time = (name: string) => name.slice(-'20261119-143005Z.sqlite'.length)
  return fs
    .readdirSync(dir)
    .filter((name) => name.startsWith(prefix) && name.endsWith('.sqlite'))
    .sort((a, b) => time(a).localeCompare(time(b)))
}

/** Deletes all but the newest `keep` copies with this prefix; returns how many went. */
function pruneBackups(dir: string, prefix: string, keep: number): number {
  const old = listBackups(dir, prefix).slice(0, -keep)
  for (const name of old) fs.rmSync(path.join(dir, name))
  return old.length
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

export function readMigrations(dir: string): MigrationFile[] {
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

export interface MigrationResult {
  applied: string[]
  // Path of the copy taken before the first pending migration, or null when
  // nothing was pending or the database was new.
  backup: string | null
}

/* Applies pending migrations. On a database that already has some, it first
   writes backups/pre-migration-NNNN-<time>.sqlite, NNNN being the first
   migration to apply; if that copy fails, nothing is applied. A failing
   migration is rolled back and stops the run; nothing is ever reset or
   recreated.

   Foreign keys are off while migrations run, so a migration can rebuild a
   table the way SQLite requires (create the new one, copy, drop the old one,
   rename) without the drop deleting the rows that point at it. Each
   migration is checked with foreign_key_check before it commits instead. */
export function migrate(db: Database, migrationsDir = MIGRATIONS_DIR): MigrationResult {
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
  const first = pending[0]
  if (!first) return { applied: [], backup: null }

  let backup: string | null = null
  if (done.size > 0) {
    try {
      backup = backupDatabase(db, `pre-migration-${String(first.version).padStart(4, '0')}`)
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      throw new MigrationError(`Backup before ${first.name} failed: ${reason}`, { cause: error })
    }
  }

  const record = db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)')
  const applied: string[] = []
  // The pragma has no effect inside a transaction, so it is set around them.
  const foreignKeys = db.prepare('PRAGMA foreign_keys').get()?.foreign_keys as number
  db.exec('PRAGMA foreign_keys = OFF')
  try {
    for (const migration of pending) {
      try {
        transaction(db, () => {
          db.exec(migration.sql)
          const broken = db.prepare('PRAGMA foreign_key_check').get()
          if (broken) throw new Error(`a row in ${String(broken.table)} points at a missing ${String(broken.parent)} row`)
          record.run(migration.version, migration.name, new Date().toISOString())
        })
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        throw new MigrationError(`Migration ${migration.name} failed: ${reason}`, { cause: error })
      }
      applied.push(migration.name)
    }
  } finally {
    db.exec(`PRAGMA foreign_keys = ${foreignKeys ? 'ON' : 'OFF'}`)
  }
  return { applied, backup }
}
