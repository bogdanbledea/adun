import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { describe, test } from 'node:test'
import { ConfigError, type BackupConfig, type OffsiteConfig } from '../config.ts'
import { captureLogger, tempDatabase, tempDir } from '../../test/helpers.ts'
import { fakeStore } from '../../test/s3.ts'
import { msUntilDue, prepareBackups, runBackups, startScheduledBackups } from './backups.ts'

const HOUR = 60 * 60 * 1000
const NOW = new Date('2026-11-26T12:00:00Z')

function setup(keep = 3, offsite: OffsiteConfig | null = null) {
  const { db } = tempDatabase()
  const dir = path.join(tempDir(), 'backups')
  fs.mkdirSync(dir)
  const backup: BackupConfig = { dir, intervalHours: 6, keep, offsite }
  return { db, backup }
}

const touch = (dir: string, name: string) => {
  fs.writeFileSync(path.join(dir, name), '')
}

const configError = (variable: string) => (error: unknown) => error instanceof ConfigError && error.message.includes(variable)

describe('local copies', () => {
  test('writes a readable copy into the backup folder', async () => {
    const { db, backup } = setup()
    db.prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (9999, 'marker', '')").run()

    await runBackups(db, backup, captureLogger().log, NOW)

    const copy = new DatabaseSync(path.join(backup.dir, 'auto-20261126-120000Z.sqlite'), { readOnly: true })
    assert.ok(copy.prepare('SELECT 1 FROM schema_migrations WHERE version = 9999').get())
    copy.close()
  })

  test('keeps only the newest copies, and leaves other files alone', async () => {
    const { db, backup } = setup(2)
    const { log, lines } = captureLogger()
    touch(backup.dir, 'auto-20261124-120000Z.sqlite')
    touch(backup.dir, 'auto-20261125-120000Z.sqlite')
    touch(backup.dir, 'adun-20261101-120000Z.sqlite')
    touch(backup.dir, 'notes.txt')

    await runBackups(db, backup, log, NOW)

    assert.deepEqual(fs.readdirSync(backup.dir).sort(), [
      'adun-20261101-120000Z.sqlite',
      'auto-20261125-120000Z.sqlite',
      'auto-20261126-120000Z.sqlite',
      'notes.txt',
    ])
    assert.deepEqual(
      lines.map((line) => [line.msg, line.file ?? line.deleted]),
      [
        ['backup.created', 'auto-20261126-120000Z.sqlite'],
        ['backup.pruned', 1],
      ],
    )
  })

  test('the next copy is due an interval after the newest one', async () => {
    const { db, backup } = setup()
    assert.equal(msUntilDue(backup, NOW.getTime()), 0)

    touch(backup.dir, 'auto-20261126-100000Z.sqlite')
    touch(backup.dir, 'auto-20261125-100000Z.sqlite')
    assert.equal(msUntilDue(backup, NOW.getTime()), 4 * HOUR)
    assert.equal(msUntilDue(backup, NOW.getTime() + 7 * HOUR), 0)

    assert.equal(await runBackups(db, backup, captureLogger().log, NOW), 4 * HOUR)
    assert.equal(fs.readdirSync(backup.dir).length, 2)
  })
})

describe('startScheduledBackups', () => {
  test('a fresh copy in the folder means none at startup', async () => {
    const { db, backup } = setup()
    const { log, lines } = captureLogger()
    await runBackups(db, backup, log)
    lines.length = 0

    const stop = startScheduledBackups(db, backup, log)
    stop()

    assert.equal(fs.readdirSync(backup.dir).length, 1)
    assert.equal(lines.length, 0)
  })

  test('takes a copy at startup when none is there', () => {
    const { db, backup } = setup()
    const { log, lines } = captureLogger()

    const stop = startScheduledBackups(db, backup, log)
    stop()

    const [file] = fs.readdirSync(backup.dir)
    assert.match(file ?? '', /^auto-\d{8}-\d{6}Z\.sqlite$/)
    assert.deepEqual(
      lines.map((line) => [line.msg, line.file]),
      [['backup.created', file]],
    )
  })

  test('a failed copy is logged and does not stop the server', async () => {
    const { db, backup } = setup()
    const { log, lines } = captureLogger()
    fs.rmSync(backup.dir, { recursive: true })
    touch(path.dirname(backup.dir), 'backups')

    const stop = startScheduledBackups(db, backup, log)
    await new Promise(setImmediate)
    stop()

    assert.deepEqual(
      lines.map((line) => line.msg),
      ['backup.failed'],
    )
  })
})

// A key pair made with the real age, as an operator would.
function ageKeys() {
  const identity = path.join(tempDir(), 'key.txt')
  execFileSync('age-keygen', ['-o', identity], { stdio: 'ignore' })
  const recipient = execFileSync('age-keygen', ['-y', identity], { encoding: 'utf8' }).trim()
  return { identity, recipient }
}

describe('uploads', () => {
  const { identity, recipient } = ageKeys()

  async function offsiteSetup(keep = 3) {
    const store = await fakeStore()
    const offsite: OffsiteConfig = { target: store.target, prefix: 'home', ageRecipient: recipient }
    return { ...setup(keep, offsite), store }
  }

  test('each copy goes up encrypted to the recipient, and only the key opens it', async () => {
    const { db, backup, store } = await offsiteSetup()
    const { log, lines } = captureLogger()

    await runBackups(db, backup, log, NOW)

    const name = 'auto-20261126-120000Z.sqlite'
    const uploaded = store.objects.get(`/backups/home/${name}.age`)
    assert.ok(uploaded)
    assert.ok(uploaded.toString('latin1').startsWith('age-encryption.org/v1\n'))
    const plain = execFileSync('age', ['-d', '-i', identity], { input: uploaded })
    assert.deepEqual(plain, fs.readFileSync(path.join(backup.dir, name)))
    assert.ok(fs.existsSync(path.join(backup.dir, `.${name}.uploaded`)))
    assert.deepEqual(
      lines.map((line) => [line.msg, line.file]),
      [
        ['backup.created', name],
        ['backup.uploaded', name],
      ],
    )
  })

  test('without a prefix the copy goes to the top of the bucket', async () => {
    const { db, backup, store } = await offsiteSetup()
    if (backup.offsite) backup.offsite.prefix = ''
    await runBackups(db, backup, captureLogger().log, NOW)
    assert.deepEqual([...store.objects.keys()], ['/backups/auto-20261126-120000Z.sqlite.age'])
  })

  test('a copy that did not go up is kept past BACKUP_KEEP and tried again within the hour', async () => {
    const { db, backup, store } = await offsiteSetup(1)
    const { log, lines } = captureLogger()
    store.answers.push({ status: 403, body: '<Error><Code>AccessDenied</Code></Error>' })

    const wait = await runBackups(db, backup, log, NOW)
    assert.equal(wait, HOUR)
    assert.equal(lines.at(-1)?.msg, 'backup.upload_failed')

    // The next day's copy: the first one is past BACKUP_KEEP, but not uploaded yet.
    const tomorrow = new Date(NOW.getTime() + 24 * HOUR)
    store.answers.push({ status: 503 })
    await runBackups(db, backup, log, tomorrow)
    assert.equal(fs.readdirSync(backup.dir).filter((name) => name.startsWith('auto-')).length, 2)

    // Both go up, oldest first; then only the newest stays.
    assert.equal(await runBackups(db, backup, log, new Date(tomorrow.getTime() + HOUR)), 5 * HOUR)
    assert.deepEqual([...store.objects.keys()], [
      '/backups/home/auto-20261126-120000Z.sqlite.age',
      '/backups/home/auto-20261127-120000Z.sqlite.age',
    ])
    assert.deepEqual(fs.readdirSync(backup.dir).sort(), [
      '.auto-20261127-120000Z.sqlite.uploaded',
      'auto-20261127-120000Z.sqlite',
    ])
  })

  test('a copy already in the store is marked, not sent again', async () => {
    const { db, backup, store } = await offsiteSetup()
    const { log, lines } = captureLogger()
    store.objects.set('/backups/home/auto-20261126-120000Z.sqlite.age', Buffer.from('sent before'))

    await runBackups(db, backup, log, NOW)

    assert.deepEqual(
      store.received.map((request) => request.method),
      ['HEAD'],
    )
    assert.equal(lines.at(-1)?.msg, 'backup.already_uploaded')
    assert.ok(fs.existsSync(path.join(backup.dir, '.auto-20261126-120000Z.sqlite.uploaded')))
  })

  test('a marker left without its copy is removed', async () => {
    const { db, backup } = await offsiteSetup()
    touch(backup.dir, '.auto-20261101-120000Z.sqlite.uploaded')
    await runBackups(db, backup, captureLogger().log, NOW)
    assert.ok(!fs.existsSync(path.join(backup.dir, '.auto-20261101-120000Z.sqlite.uploaded')))
  })

  test('startup stops on a recipient age refuses, or without age', async () => {
    const { backup } = await offsiteSetup()
    assert.doesNotThrow(() => {
      prepareBackups(backup)
    })

    const offsite = backup.offsite as OffsiteConfig
    assert.throws(() => {
      prepareBackups({ ...backup, offsite: { ...offsite, ageRecipient: 'age1notakey' } })
    }, configError('BACKUP_AGE_RECIPIENT'))

    const pathBefore = process.env.PATH
    process.env.PATH = tempDir()
    try {
      assert.throws(() => {
        prepareBackups(backup)
      }, /age program is not installed/)
    } finally {
      process.env.PATH = pathBefore
    }
  })
})

test('a folder that cannot be written to stops startup, naming BACKUP_DIR', () => {
  const parent = tempDir()
  touch(parent, 'file')
  const backup = (dir: string): BackupConfig => ({ dir, intervalHours: 24, keep: 7, offsite: null })
  assert.throws(() => {
    prepareBackups(backup(path.join(parent, 'file', 'backups')))
  }, configError('BACKUP_DIR'))

  const dir = path.join(parent, 'new', 'backups')
  prepareBackups(backup(dir))
  assert.ok(fs.statSync(dir).isDirectory())
})
