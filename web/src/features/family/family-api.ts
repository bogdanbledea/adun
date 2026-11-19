import { api } from '../../lib/api.ts'

/* The family endpoints (server/src/features/family/routes.ts). */

export type FamilyRole = 'owner' | 'member'

export interface FamilyMember {
  userId: string
  displayName: string
  role: FamilyRole
  joinedAt: string
}

export interface Family {
  name: string
  createdAt: string
  /** In the order they joined. */
  members: FamilyMember[]
  /** The signed-in user's role. */
  role: FamilyRole
}

export interface FamilyInvite {
  code: string
  expiresAt: string
}

export const familyApi = {
  get: (signal?: AbortSignal) => api<Family | null>('/api/family', { signal }),
  create: (name: string) => api<Family>('/api/family', { method: 'POST', body: { name } }),
  rename: (name: string) => api<Family>('/api/family', { method: 'PATCH', body: { name } }),
  invite: () => api<FamilyInvite>('/api/family/invites', { method: 'POST' }),
  join: (code: string) => api<Family>('/api/family/join', { method: 'POST', body: { code } }),
  leave: () => api<{ ok: true; dissolved: boolean }>('/api/family/leave', { method: 'POST' }),
  transfer: (userId: string) => api<Family>('/api/family/owner', { method: 'POST', body: { userId } }),
}
