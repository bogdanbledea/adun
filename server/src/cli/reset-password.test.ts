import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { createUser } from '../../test/auth.ts'
import { tempDatabase, tempDir } from '../../test/helpers.ts'
import { openDatabase } from '../db.ts'
import { passwords } from '../features/auth/password.ts'

const script = path.join(import.meta.dirname, 'reset-password.ts')
const run = (dataDir: string, args: string[]) =>
  spawnSync(process.execPath, [script, ...args], { env: { ADUN_DATA_DIR: dataDir }, encoding: 'utf8' })

test('prints a new password that the account now has', async () => {
  const { db, dataDir } = tempDatabase()
  await createUser(db, 'ana@example.com')
  db.close()
  const result = run(dataDir, ['ana@example.com'])
  assert.equal(result.status, 0)
  const password = /New password for ana@example\.com: (\S+)/.exec(result.stdout)?.[1]
  assert.match(password ?? '', /^[\w-]{5}-[\w-]{5}-[\w-]{5}-[\w-]{5}$/)

  const reopened = openDatabase(dataDir)
  const row = reopened.prepare("SELECT password_hash FROM users WHERE email = 'ana@example.com'").get()
  assert.ok(await passwords.verify(row?.password_hash as string, password ?? ''))
  reopened.close()
})

test('says so and fails for an unknown address', () => {
  const { db, dataDir } = tempDatabase()
  db.close()
  const result = run(dataDir, ['nobody@example.com'])
  assert.equal(result.status, 1)
  assert.match(result.stderr, /No account with that address/)
})

test('asks for an address', () => {
  const result = run(tempDir(), [])
  assert.equal(result.status, 2)
  assert.match(result.stderr, /Usage: npm run reset-password -- <email>/)
})

test('refuses when there is no database, instead of creating an empty one', () => {
  const dataDir = tempDir()
  const result = run(dataDir, ['ana@example.com'])
  assert.equal(result.status, 1)
  assert.match(result.stderr, /No database at/)
  assert.deepEqual(fs.readdirSync(dataDir), [])
})
