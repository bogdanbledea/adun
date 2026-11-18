import { randomUUID } from 'node:crypto'
import type { Database } from '../../db.ts'
import type { Logger } from '../../lib/log.ts'
import { passwords } from './password.ts'
import * as repo from './repository.ts'

export interface Registration {
  email: string
  password: string
  displayName: string
  acceptPrivacyVersion: string
}

/** Creates the account unless the address is taken, and says which happened.
    The caller answers the same either way, so nobody can probe for accounts. */
export async function register(db: Database, log: Logger, input: Registration): Promise<boolean> {
  // Hashed before looking at the address, so a taken address costs the same.
  const passwordHash = await passwords.hash(input.password)
  const id = randomUUID()
  const created = repo.insertUser(db, {
    id,
    email: input.email,
    displayName: input.displayName,
    passwordHash,
    privacyPolicyVersion: input.acceptPrivacyVersion,
    now: new Date().toISOString(),
  })
  if (created) log.info({ userId: id }, 'auth.registered')
  else log.info('auth.register_existing')
  return created
}
