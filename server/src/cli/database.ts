import fs from 'node:fs'
import path from 'node:path'
import { DATABASE_FILE, openDatabase, type Database } from '../db.ts'

/* For commands that need the database to be there already: opening it would
   otherwise create an empty one. Says where it looked and exits with 1. */
export function openExistingDatabase(dataDir: string): Database {
  const file = path.join(dataDir, DATABASE_FILE)
  if (!fs.existsSync(file)) {
    console.error(`No database at ${file}`)
    process.exit(1)
  }
  return openDatabase(dataDir)
}
