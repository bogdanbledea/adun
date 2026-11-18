import { randomUUID } from 'node:crypto'
import { transaction, type Database } from '../../db.ts'
import * as repo from './repository.ts'
import { hashToken, looksLikeToken, newToken } from './session.ts'

/* Tokens for links in emails. The link carries the token; the database keeps
   only its SHA-256. A token works once, until it expires, and only for its
   purpose. Issuing a new one for the same account and purpose removes the
   earlier one, so only the latest link works. */

const HOUR = 60 * 60 * 1000

// The emails (email/templates.ts) state these lifetimes; keep them in step.
export const TOKEN_TTL_MS: Record<repo.TokenPurpose, number> = {
  email_verification: 24 * HOUR,
  password_reset: HOUR,
}

/** Returns the token to put in the link. `browserHash` ties it to the browser
    that asked (the hash of its cookie), for links that may sign in. */
export function issueToken(
  db: Database,
  userId: string,
  purpose: repo.TokenPurpose,
  browserHash: string | null = null,
): string {
  const token = newToken()
  const now = Date.now()
  transaction(db, () => {
    repo.deleteTokens(db, userId, purpose)
    repo.insertToken(db, {
      id: randomUUID(),
      userId,
      purpose,
      tokenHash: hashToken(token),
      browserHash,
      expiresAt: new Date(now + TOKEN_TTL_MS[purpose]).toISOString(),
      now: new Date(now).toISOString(),
    })
  })
  return token
}

/** Uses up the token and returns its account, or null when it is malformed,
    unknown, already used, replaced, expired or meant for something else. */
export function consumeToken(db: Database, token: string, purpose: repo.TokenPurpose): repo.LiveToken | null {
  if (!looksLikeToken(token)) return null
  return repo.consumeToken(db, hashToken(token), purpose, new Date().toISOString())
}

/** The account of a usable token, without using it up; null as for consumeToken. */
export function peekToken(db: Database, token: string, purpose: repo.TokenPurpose): repo.LiveToken | null {
  if (!looksLikeToken(token)) return null
  return repo.findLiveToken(db, hashToken(token), purpose, new Date().toISOString())
}
