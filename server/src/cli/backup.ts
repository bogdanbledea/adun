import { loadConfig } from '../config.ts'
import { backupDatabase } from '../db.ts'
import { openExistingDatabase } from './database.ts'

// npm run backup — writes a consistent copy of the database to
// <data dir>/backups/adun-<UTC time>.sqlite. Safe while the server runs.

const { dataDir } = loadConfig(process.env)
const db = openExistingDatabase(dataDir)
try {
  console.log(`Backup written to ${backupDatabase(db, 'adun')}`)
} finally {
  db.close()
}
