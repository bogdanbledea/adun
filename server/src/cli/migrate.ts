import { loadConfig } from '../config.ts'
import { closeDatabase, migrate, openDatabase } from '../db.ts'

// npm run migrate — applies pending migrations without starting the server.
// The server does the same at startup; this is for checking an upgrade.

const { dataDir } = loadConfig(process.env)
const db = openDatabase(dataDir)
try {
  const applied = migrate(db)
  console.log(applied.length > 0 ? `Applied: ${applied.join(', ')}` : 'Database is up to date.')
} finally {
  closeDatabase(db)
}
