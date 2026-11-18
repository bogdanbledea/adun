import type { Database } from '../../db.ts'
import type { Language } from '../../email/templates.ts'

/* The account as the signed-in user sees it, and the changes they can make to
   it. */

export interface PublicUser {
  id: string
  email: string
  displayName: string
  createdAt: string
}

const COLUMNS = 'id, email, display_name, created_at'

function toPublicUser(row: Record<string, unknown>): PublicUser {
  return {
    id: row.id as string,
    email: row.email as string,
    displayName: row.display_name as string,
    createdAt: row.created_at as string,
  }
}

export function findUser(db: Database, userId: string): PublicUser | null {
  const row = db.prepare(`SELECT ${COLUMNS} FROM users WHERE id = ?`).get(userId)
  return row ? toPublicUser(row) : null
}

/** Changes the name and returns the account. */
export function setDisplayName(db: Database, userId: string, displayName: string): PublicUser | null {
  const row = db.prepare(`UPDATE users SET display_name = ? WHERE id = ? RETURNING ${COLUMNS}`).get(displayName, userId)
  return row ? toPublicUser(row) : null
}

/** The language of the emails sent with no request to read it from. */
export function setLanguage(db: Database, userId: string, language: Language): void {
  db.prepare('UPDATE users SET language = ? WHERE id = ?').run(language, userId)
}

/** Deletes the account; its sessions, links and email records go with it
    (ON DELETE CASCADE). */
export function deleteUser(db: Database, userId: string): boolean {
  return db.prepare('DELETE FROM users WHERE id = ?').run(userId).changes === 1
}
