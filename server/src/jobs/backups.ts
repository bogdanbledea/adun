import { execFile, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import { ConfigError, type BackupConfig, type OffsiteConfig } from '../config.ts'
import { backupDatabase, listBackups, type Database } from '../db.ts'
import { objectExists, putObject } from '../lib/s3.ts'
import type { Logger } from '../lib/log.ts'

/* Scheduled copies of the database, auto-<UTC time>.sqlite in BACKUP_DIR, every
   BACKUP_INTERVAL_HOURS. The next one is due that long after the newest copy in
   the folder, so a restart neither skips one nor takes an extra.

   With uploads on, each copy is encrypted with age and sent to the S3 store,
   and an empty .<copy>.uploaded file beside it records that. A copy that did
   not go up is tried again every hour, oldest first, and is not deleted until
   it has; otherwise only the newest BACKUP_KEEP copies stay. Other files in
   the folder are left alone. */

const PREFIX = 'auto'
const HOUR_MS = 60 * 60 * 1000
// age writes the encrypted copy to memory, which must hold it for the upload.
const MAX_ENCRYPTED_BYTES = 1024 * 1024 * 1024

const execFileAsync = promisify(execFile)

/** Stops startup when the folder cannot be written to, or age is missing or refuses the recipient. */
export function prepareBackups(backup: BackupConfig): void {
  try {
    fs.mkdirSync(backup.dir, { recursive: true, mode: 0o700 })
    fs.accessSync(backup.dir, fs.constants.W_OK)
  } catch {
    throw new ConfigError(`BACKUP_DIR ${backup.dir} cannot be created, or this user cannot write to it`)
  }
  if (backup.offsite === null) return
  const check = spawnSync('age', ['-r', backup.offsite.ageRecipient], { input: '' })
  if (check.error) throw new ConfigError('BACKUP_AGE_RECIPIENT is set, but the age program is not installed')
  if (check.status !== 0) throw new ConfigError('BACKUP_AGE_RECIPIENT is not a public key age accepts')
}

// The time in a copy's name, …-20261119-143005Z.sqlite; NaN for a name in another shape.
function takenAt(name: string): number {
  const t = name.slice(-'20261119-143005Z.sqlite'.length)
  return Date.parse(`${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}T${t.slice(9, 11)}:${t.slice(11, 13)}:${t.slice(13, 15)}Z`)
}

export function msUntilDue(backup: BackupConfig, now: number): number {
  const newest = listBackups(backup.dir, `${PREFIX}-`).at(-1)
  if (newest === undefined || Number.isNaN(takenAt(newest))) return 0
  return Math.max(0, takenAt(newest) + backup.intervalHours * HOUR_MS - now)
}

const marker = (dir: string, name: string) => path.join(dir, `.${name}.uploaded`)
const isUploaded = (dir: string, name: string) => fs.existsSync(marker(dir, name))

async function encrypt(file: string, recipient: string): Promise<Buffer> {
  const { stdout } = await execFileAsync('age', ['-r', recipient, file], { encoding: 'buffer', maxBuffer: MAX_ENCRYPTED_BYTES })
  return stdout
}

/** Uploads the copies not uploaded yet, oldest first, until one fails; returns how many are left. */
async function uploadPending(dir: string, offsite: OffsiteConfig, log: Logger): Promise<number> {
  const pending = listBackups(dir, `${PREFIX}-`).filter((name) => !isUploaded(dir, name))
  for (const [index, name] of pending.entries()) {
    const key = offsite.prefix === '' ? `${name}.age` : `${offsite.prefix}/${name}.age`
    try {
      // Already there when the process stopped between the upload and the
      // marker; a store with object lock would refuse it a second time.
      if (await objectExists(offsite.target, key)) {
        log.info({ file: name }, 'backup.already_uploaded')
      } else {
        await putObject(offsite.target, key, await encrypt(path.join(dir, name), offsite.ageRecipient))
        log.info({ file: name }, 'backup.uploaded')
      }
      fs.writeFileSync(marker(dir, name), '')
    } catch (error) {
      log.error({ err: error, file: name }, 'backup.upload_failed')
      return pending.length - index
    }
  }
  return 0
}

/** Deletes the copies past BACKUP_KEEP (only uploaded ones, with uploads on) and markers left without a copy. */
function prune(backup: BackupConfig): number {
  const names = listBackups(backup.dir, `${PREFIX}-`)
  const old = names.slice(0, -backup.keep).filter((name) => backup.offsite === null || isUploaded(backup.dir, name))
  for (const name of old) {
    fs.rmSync(path.join(backup.dir, name))
    fs.rmSync(marker(backup.dir, name), { force: true })
  }
  const kept = new Set(names)
  for (const file of fs.readdirSync(backup.dir)) {
    const copy = /^\.(auto-.+\.sqlite)\.uploaded$/.exec(file)?.[1]
    if (copy !== undefined && !kept.has(copy)) fs.rmSync(path.join(backup.dir, file))
  }
  return old.length
}

/** Takes a copy if one is due, uploads what is pending, prunes; returns the milliseconds until the next run. */
export async function runBackups(db: Database, backup: BackupConfig, log: Logger, now = new Date()): Promise<number> {
  let wait = msUntilDue(backup, now.getTime())
  if (wait === 0) {
    const file = backupDatabase(db, PREFIX, now, backup.dir)
    log.info({ file: path.basename(file) }, 'backup.created')
    wait = backup.intervalHours * HOUR_MS
  }
  if (backup.offsite !== null && (await uploadPending(backup.dir, backup.offsite, log)) > 0) {
    wait = Math.min(wait, HOUR_MS)
  }
  const deleted = prune(backup)
  if (deleted > 0) log.info({ deleted }, 'backup.pruned')
  return wait
}

/** Runs now, then whenever the next run is due; returns a function that stops it. An upload in
    progress is not waited for: the next start finds it unmarked and checks the store. */
export function startScheduledBackups(db: Database, backup: BackupConfig, log: Logger): () => void {
  let timer: NodeJS.Timeout | undefined
  let stopped = false
  const tick = async () => {
    let wait = HOUR_MS
    try {
      wait = await runBackups(db, backup, log)
    } catch (error) {
      log.error({ err: error }, 'backup.failed')
    }
    if (stopped) return
    timer = setTimeout(() => void tick(), wait)
    timer.unref()
  }
  void tick()
  return () => {
    stopped = true
    clearTimeout(timer)
  }
}
