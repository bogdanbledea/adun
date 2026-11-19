import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { backupDatabase, closeDatabase, DATABASE_FILE, MIGRATIONS_DIR, openDatabase, readMigrations } from './db.ts'

/* Puts a backup in place of the database. Used by `npm run restore`, while the
   server is stopped. */

export class RestoreError extends Error {
  override name = 'RestoreError'
}

export interface RestoreResult {
  // The last migration the backup has; newer ones run when the server starts.
  migration: string
  // Where the database that was replaced went, or null if there was none.
  saved: string | null
}

export function restoreDatabase(dataDir: string, source: string, migrationsDir = MIGRATIONS_DIR): RestoreResult {
  const target = path.join(dataDir, DATABASE_FILE)
  if (!fs.existsSync(source)) throw new RestoreError(`No file at ${source}`)
  if (fs.existsSync(target) && fs.realpathSync(source) === fs.realpathSync(target)) {
    throw new RestoreError('That file is the database itself; pick a backup')
  }
  const migration = checkBackup(source, migrationsDir)

  let saved: string | null = null
  if (fs.existsSync(target)) {
    const db = openDatabase(dataDir)
    try {
      // Fails at once if any other connection, such as the server's, has the
      // database open. Exclusive locking mode then keeps the lock until close.
      db.exec('PRAGMA busy_timeout = 0; PRAGMA locking_mode = EXCLUSIVE; BEGIN EXCLUSIVE; COMMIT')
    } catch {
      db.close()
      throw new RestoreError('The database is in use; stop the server first')
    }
    saved = backupDatabase(db, 'pre-restore')
    closeDatabase(db)
  }

  // Copied next to the database, then renamed over it in one step.
  process.umask(0o077)
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 })
  const temporary = `${target}.restoring`
  fs.copyFileSync(source, temporary)
  fs.chmodSync(temporary, 0o600)
  for (const suffix of ['-wal', '-shm']) fs.rmSync(target + suffix, { force: true })
  fs.renameSync(temporary, target)
  return { migration, saved }
}

/* A backup must be a sound SQLite file whose migrations are all ones this
   version knows, under the same names. Returns its last migration. */
function checkBackup(file: string, migrationsDir: string): string {
  let db: DatabaseSync | undefined
  try {
    const header = Buffer.alloc(16)
    const fd = fs.openSync(file, 'r')
    try {
      fs.readSync(fd, header, 0, 16, 0)
    } finally {
      fs.closeSync(fd)
    }
    if (header.toString('latin1') !== 'SQLite format 3\0') throw new RestoreError('Not a SQLite database')

    db = new DatabaseSync(file, { readOnly: true })
    const integrity = db.prepare('PRAGMA integrity_check').get()?.integrity_check
    if (integrity !== 'ok') throw new RestoreError('The backup is damaged (integrity_check failed)')
    const hasMigrations = db
      .prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'schema_migrations'")
      .get()
    const applied = hasMigrations
      ? db.prepare('SELECT version, name FROM schema_migrations ORDER BY version').all()
      : []
    const last = applied.at(-1)
    if (!last) throw new RestoreError('Not an Adun database: it has no migrations')

    const known = new Map(readMigrations(migrationsDir).map((m) => [m.version, m.name]))
    for (const { version, name } of applied) {
      if (!known.has(version as number)) {
        throw new RestoreError(`The backup is from a newer version of Adun (it has ${String(name)})`)
      }
      if (known.get(version as number) !== name) {
        throw new RestoreError(`Not an Adun database: migration ${String(name)} is not one of ours`)
      }
    }
    return String(last.name)
  } catch (error) {
    if (error instanceof RestoreError) throw error
    const reason = error instanceof Error ? error.message : String(error)
    throw new RestoreError(`The backup cannot be read (${reason})`, { cause: error })
  } finally {
    db?.close()
  }
}
