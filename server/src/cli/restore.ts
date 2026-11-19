import path from 'node:path'
import { loadConfig } from '../config.ts'
import { restoreDatabase, RestoreError } from '../restore.ts'

// npm run restore -- <backup file> — replaces the database with a backup,
// keeping the one it replaces in backups/pre-restore-<UTC time>.sqlite. The
// server must be stopped; migrations the backup lacks run when it starts.

const source = process.argv[2]
if (!source) {
  console.error('Usage: npm run restore -- <backup file>')
  process.exit(1)
}

const { dataDir } = loadConfig(process.env)
// npm runs scripts from server/; a relative path means the caller's folder.
const file = path.resolve(process.env.INIT_CWD ?? '.', source)
try {
  const { migration, saved } = restoreDatabase(dataDir, file)
  if (saved) console.log(`The database it replaces was saved to ${saved}`)
  console.log(`Restored ${file} (last migration ${migration}).`)
} catch (error) {
  if (!(error instanceof RestoreError)) throw error
  console.error(`Not restored: ${error.message}`)
  process.exit(1)
}
