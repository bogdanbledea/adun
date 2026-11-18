import { randomBytes } from 'node:crypto'
import { hash, verify } from '@node-rs/argon2'

/* Argon2id with OWASP's recommended minimum: 19 MiB, 2 iterations, 1 lane.
   Argon2id is the library's default algorithm (its `Algorithm` enum is a
   const enum, which type stripping cannot use); the tests check the variant
   in the produced hash. */

const OPTIONS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const

export const PASSWORD_MAX_LENGTH = 200

/** Why a new password is refused, or null when it is acceptable. */
export function passwordProblem(password: string): 'too_short' | 'too_long' | 'too_simple' | null {
  if (password.length < 12) return 'too_short'
  if (password.length > PASSWORD_MAX_LENGTH) return 'too_long'
  const varied = /[a-z]/.test(password) && /[A-Z]/.test(password) && /[0-9]/.test(password) && /[^A-Za-z0-9]/.test(password)
  return varied ? null : 'too_simple'
}

// A hash of a random value, made once with the same parameters, so verifying
// against it costs exactly what a real verification costs.
let dummyHash: Promise<string> | null = null

/* Kept on one object so tests can count calls with mock.method. */
export const passwords = {
  hash(plain: string): Promise<string> {
    return hash(plain, OPTIONS)
  },

  async verify(digest: string, plain: string): Promise<boolean> {
    try {
      return await verify(digest, plain)
    } catch {
      // A malformed digest is a failed sign-in, not a 500.
      return false
    }
  },

  /** Spends one verification when there is no real hash to check, so an
      unknown or locked account answers in the same time as a wrong password. */
  async verifyDummy(plain: string): Promise<void> {
    dummyHash ??= passwords.hash(randomBytes(16).toString('hex'))
    await passwords.verify(await dummyHash, plain)
  },
}
