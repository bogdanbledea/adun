import type { AuthUser } from '../lib/auth.tsx'

/** The account GET /api/user/me answers with in tests. */
export const testAccount: AuthUser = {
  id: 'u1',
  email: 'ana@example.com',
  displayName: 'Ana Popescu',
  createdAt: '2026-11-18T08:00:00.000Z',
}
