import fs from 'node:fs'
import path from 'node:path'
import { loadConfig } from '../config.ts'
import { restoreDatabase, RestoreError } from '../restore.ts'

// npm run restore -- <backup file> — replaces the database with a backup,
// keeping the one it replaces in backups/pre-restore-<UTC time>.sqlite. The
// server must be stopped; migrations the backup lacks run when it starts.
// With - for the file, the backup is read from standard input, which is how
// a file from the host reaches a container.

const source = process.argv[2]
if (!source) {
  console.error('Usage: npm run restore -- <backup file | ->')
  process.exit(1)
}

const { dataDir } = loadConfig(process.env)
let file: string
if (source === '-') {
  process.umask(0o077)
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 })
  file = path.join(dataDir, 'restore-input.sqlite')
  // Read as a stream: a synchronous read of a pipe fails with EAGAIN when the
  // data is not there yet.
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer)
  fs.writeFileSync(file, Buffer.concat(chunks))
} else {
  // npm runs scripts from server/; a relative path means the caller's folder.
  file = path.resolve(process.env.INIT_CWD ?? '.', source)
}

try {
  const { migration, saved } = restoreDatabase(dataDir, file)
  if (saved) console.log(`The database it replaces was saved to ${saved}`)
  console.log(`Restored ${source === '-' ? 'the backup' : file} (last migration ${migration}).`)
} catch (error) {
  if (!(error instanceof RestoreError)) throw error
  console.error(`Not restored: ${error.message}`)
  process.exitCode = 1
} finally {
  if (source === '-') fs.rmSync(file, { force: true })
}
