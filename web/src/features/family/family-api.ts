import { api } from '../../lib/api.ts'

/* The family endpoints (server/src/features/family/routes.ts) and the food
   sharing ones (server/src/features/food/sharing.ts). */

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

export interface ShareSummary {
  totalBani: number
  purchaseCount: number
}

export interface SharePreview {
  /** Personal months the family has no budget for: they move over as they are. */
  clean: { monthKey: string; mine: ShareSummary }[]
  /** Personal months the family already has: one of the two must be chosen. */
  conflicts: { monthKey: string; mine: ShareSummary; family: ShareSummary }[]
}

export type Resolution = 'keep_mine' | 'keep_theirs'

export const familyApi = {
  get: (signal?: AbortSignal) => api<Family | null>('/api/family', { signal }),
  create: (name: string) => api<Family>('/api/family', { method: 'POST', body: { name } }),
  rename: (name: string) => api<Family>('/api/family', { method: 'PATCH', body: { name } }),
  invite: () => api<FamilyInvite>('/api/family/invites', { method: 'POST' }),
  join: (code: string) => api<Family>('/api/family/join', { method: 'POST', body: { code } }),
  leave: () => api<{ ok: true; dissolved: boolean }>('/api/family/leave', { method: 'POST' }),
  transfer: (userId: string) => api<Family>('/api/family/owner', { method: 'POST', body: { userId } }),
  sharePreview: (signal?: AbortSignal) => api<SharePreview>('/api/food/share/preview', { signal }),
  share: () => api<{ moved: string[]; skipped: string[] }>('/api/food/share', { method: 'POST' }),
  resolve: (monthKey: string, resolution: Resolution) =>
    api<{ monthKey: string; resolution: Resolution }>('/api/food/share/resolve', {
      method: 'POST',
      body: { monthKey, resolution },
    }),
}
