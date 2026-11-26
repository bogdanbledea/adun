import fs from 'node:fs'
import path from 'node:path'
import { ConfigError, type BackupConfig } from '../config.ts'
import { backupDatabase, listBackups, pruneBackups, type Database } from '../db.ts'
import type { Logger } from '../lib/log.ts'

/* Scheduled copies of the database, auto-<UTC time>.sqlite in BACKUP_DIR, every
   BACKUP_INTERVAL_HOURS. The next one is due that long after the newest copy in
   the folder, so a restart neither skips one nor takes an extra. Only the
   newest BACKUP_KEEP of them stay; other files in the folder are left alone. */

const PREFIX = 'auto'
const HOUR_MS = 60 * 60 * 1000

/** Creates the folder if needed; stops startup when the server cannot write to it. */
export function prepareBackupDir(dir: string): void {
  try {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
    fs.accessSync(dir, fs.constants.W_OK)
  } catch {
    throw new ConfigError(`BACKUP_DIR ${dir} cannot be created, or this user cannot write to it`)
  }
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

export function runScheduledBackup(db: Database, backup: BackupConfig, now = new Date()): { file: string; deleted: number } {
  const file = backupDatabase(db, PREFIX, now, backup.dir)
  return { file, deleted: pruneBackups(backup.dir, `${PREFIX}-`, backup.keep) }
}

/** Takes a copy now if one is due, then whenever the next is; returns a function that stops it. */
export function startScheduledBackups(db: Database, backup: BackupConfig, log: Logger): () => void {
  let timer: NodeJS.Timeout | undefined
  const tick = () => {
    let wait: number
    try {
      wait = msUntilDue(backup, Date.now())
      if (wait === 0) {
        const { file, deleted } = runScheduledBackup(db, backup)
        log.info({ file: path.basename(file), deleted }, 'backup.created')
        wait = backup.intervalHours * HOUR_MS
      }
    } catch (error) {
      log.error({ err: error }, 'backup.failed')
      wait = HOUR_MS
    }
    timer = setTimeout(tick, wait)
    timer.unref()
  }
  tick()
  return () => {
    clearTimeout(timer)
  }
}
