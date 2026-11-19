import { loadConfig } from '../config.ts'
import { resetPasswordByAdmin } from '../features/auth/admin-reset.ts'
import { createLogger } from '../lib/log.ts'
import { openExistingDatabase } from './database.ts'

// npm run reset-password -- <email> — for a server with email off: gives the
// account a new random password, prints it once and signs it out everywhere.

const email = process.argv[2]
if (!email) {
  console.error('Usage: npm run reset-password -- <email>')
  process.exit(2)
}

const config = loadConfig(process.env)
const db = openExistingDatabase(config.dataDir)
try {
  const reset = await resetPasswordByAdmin(db, createLogger(config.logLevel), email)
  if (!reset) {
    console.error('No account with that address.')
    process.exitCode = 1
  } else {
    console.log(`New password for ${reset.email}: ${reset.password}`)
    console.log('Its sessions were ended. Ask its owner to choose a new password in Settings, under Security.')
  }
} finally {
  db.close()
}
