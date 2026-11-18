import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after } from 'node:test'
import { migrate, openDatabase, type Database } from '../src/db.ts'

/* Shared test helpers. Each test file gets its own temporary data directory,
   removed when the file's tests finish. */

export function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'adun-test-'))
  after(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })
  return dir
}

// A migrated database in a temporary data directory.
export function tempDatabase(): { db: Database; dataDir: string } {
  const dataDir = tempDir()
  const db = openDatabase(dataDir)
  migrate(db)
  after(() => {
    if (db.isOpen) db.close()
  })
  return { db, dataDir }
}
