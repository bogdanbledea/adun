import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { App } from '../../App.tsx'
import { testAccount } from '../../test/account.ts'
import { renderWithProviders } from '../../test/render.tsx'
import type { Family, FamilyMember, SharePreview } from './family-api.ts'

type Body = Record<string, unknown>

const ana: FamilyMember = { userId: testAccount.id, displayName: 'Ana Popescu', role: 'owner', joinedAt: '2026-11-01T08:00:00.000Z' }
const ion: FamilyMember = { userId: 'u2', displayName: 'Ion Popescu', role: 'member', joinedAt: '2026-11-02T08:00:00.000Z' }
const family = (members: FamilyMember[], role: Family['role'] = 'owner'): Family => ({
  name: 'Familia Pop',
  createdAt: '2026-11-01T08:00:00.000Z',
  members,
  role,
})

const answer = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status }))
const failure = (status: number, code: string) => answer(status, { error: { code, message: code } })

interface Options {
  preview?: SharePreview
  /** The next leave answers with this error code. */
  leaveError?: string
}

/* The settings over a fake family API that keeps its state between calls. */
function server(start: Family | null = null, { preview = { clean: [], conflicts: [] }, leaveError }: Options = {}) {
  let current = start
  let shares = preview
  let leaveFails = leaveError
  const fetchMock = vi.fn((path: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const body = init?.body ? (JSON.parse(init.body as string) as Body) : {}
    const route = `${method} ${path}`
    if (route === 'GET /api/user/me') return answer(200, testAccount)
    if (route.startsWith('GET /api/activity')) return answer(200, [])
    if (route === 'GET /api/family') return answer(200, current)
    if (route === 'POST /api/family') {
      current = { ...family([ana]), name: body.name as string }
      return answer(201, current)
    }
    if (route === 'POST /api/family/join') {
      if (body.code !== 'ABCD2345') return failure(400, 'family_invite_invalid')
      current = family([{ ...ion, role: 'owner', userId: 'u3', displayName: 'Maria' }, { ...ana, role: 'member' }], 'member')
      return answer(201, current)
    }
    if (route === 'PATCH /api/family' && current) {
      current = { ...current, name: body.name as string }
      return answer(200, current)
    }
    if (route === 'POST /api/family/invites') return answer(201, { code: 'XYZW2345', expiresAt: '2026-11-25T10:00:00.000Z' })
    if (route === 'POST /api/family/owner' && current) {
      current = family([{ ...ana, role: 'member' }, { ...ion, role: 'owner' }], 'member')
      return answer(200, current)
    }
    if (route === 'POST /api/family/leave') {
      if (leaveFails) {
        const code = leaveFails
        leaveFails = undefined
        return failure(409, code)
      }
      const dissolved = current?.members.length === 1
      current = null
      return answer(200, { ok: true, dissolved })
    }
    if (route === 'GET /api/food/share/preview') return answer(200, shares)
    if (route === 'POST /api/food/share') {
      const moved = shares.clean.map((c) => c.monthKey)
      shares = { ...shares, clean: [] }
      return answer(200, { moved, skipped: shares.conflicts.map((c) => c.monthKey) })
    }
    if (route === 'POST /api/food/share/resolve') {
      shares = { ...shares, conflicts: shares.conflicts.filter((c) => c.monthKey !== body.monthKey) }
      return answer(200, body)
    }
    return failure(404, 'not_found')
  })
  vi.stubGlobal('fetch', fetchMock)
  const sent = (method: string, path: string) =>
    fetchMock.mock.calls
      .filter(([url, init]) => url === path && (init?.method ?? 'GET') === method)
      .map(([, init]) => (init?.body ? (JSON.parse(init.body as string) as Body) : null))
  return { sent }
}

const openSettings = () => renderWithProviders(<App />, { path: '/setari', withAuth: true })
const section = () => screen.findByRole('region', { name: 'Familie' })

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('without a family', () => {
  test('making one makes the user its owner', async () => {
    const { sent } = server()
    openSettings()
    const region = await section()
    await userEvent.type(await within(region).findByLabelText('Numele familiei'), 'Familia Pop')
    await userEvent.click(within(region).getByRole('button', { name: 'Creează' }))
    expect(sent('POST', '/api/family')).toEqual([{ name: 'Familia Pop' }])
    expect(await within(region).findByText('Familia Pop')).toBeDefined()
    expect(within(region).getByText('Un membru')).toBeDefined()
    expect(within(region).getByText('Administrator')).toBeDefined()
    expect(within(region).getByRole('button', { name: 'Redenumește' })).toBeDefined()
    expect(within(region).getByRole('button', { name: /Generează un cod/ })).toBeDefined()
  })

  test('a code is typed in capitals, and a wrong one is explained', async () => {
    const { sent } = server()
    openSettings()
    const region = await section()
    const code = await within(region).findByLabelText('Cod de invitație')
    await userEvent.type(code, 'wrong234')
    expect((code as HTMLInputElement).value).toBe('WRONG234')
    await userEvent.click(within(region).getByRole('button', { name: 'Intră' }))
    expect(await within(region).findByText('Codul de invitație este greșit, a fost folosit sau a expirat.')).toBeDefined()

    await userEvent.clear(code)
    await userEvent.type(code, 'abcd2345')
    await userEvent.click(within(region).getByRole('button', { name: 'Intră' }))
    expect(sent('POST', '/api/family/join').at(-1)).toEqual({ code: 'ABCD2345' })
    expect(await within(region).findByText('Familia Pop')).toBeDefined()
    expect(within(region).getByText('2 membri')).toBeDefined()
    // A member sees no owner controls.
    expect(within(region).queryByRole('button', { name: 'Redenumește' })).toBeNull()
    expect(within(region).queryByRole('button', { name: /Generează un cod/ })).toBeNull()
  })
})

describe('in a family', () => {
  test('the owner makes an invite code, shown with the day it ends', async () => {
    server(family([ana]))
    openSettings()
    const region = await section()
    await userEvent.click(await within(region).findByRole('button', { name: /Generează un cod/ }))
    expect((await within(region).findByLabelText('Cod de invitație')).textContent).toBe('XYZW2345')
    expect(within(region).getByText(/Valabil până pe 25 noiembrie 2026\./)).toBeDefined()
    expect(within(region).getByRole('button', { name: /Cod nou/ })).toBeDefined()
  })

  test('the owner renames it', async () => {
    const { sent } = server(family([ana]))
    openSettings()
    const region = await section()
    await userEvent.click(await within(region).findByRole('button', { name: 'Redenumește' }))
    const dialog = await screen.findByRole('dialog', { name: 'Redenumește familia' })
    const name = within(dialog).getByLabelText('Numele familiei')
    await userEvent.clear(name)
    await userEvent.type(name, 'Casa noastră ')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvează' }))
    expect(sent('PATCH', '/api/family')).toEqual([{ name: 'Casa noastră' }])
    expect(await within(region).findByText('Casa noastră')).toBeDefined()
  })

  test('an owner with other members hands the role on before leaving', async () => {
    const { sent } = server(family([ana, ion]))
    openSettings()
    const region = await section()
    expect(await within(region).findByText('Predă întâi rolul de administrator altui membru.')).toBeDefined()
    expect(within(region).getByRole('button', { name: 'Părăsește familia' })).toHaveProperty('disabled', true)

    await userEvent.click(within(region).getByRole('button', { name: 'Fă-l pe Ion Popescu administrator' }))
    const dialog = await screen.findByRole('dialog', { name: 'Predai rolul de administrator?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Predă rolul' }))
    expect(sent('POST', '/api/family/owner')).toEqual([{ userId: 'u2' }])
    expect(await within(region).findByText('Lunile de mâncare rămân familiei.')).toBeDefined()

    await userEvent.click(within(region).getByRole('button', { name: 'Părăsește familia' }))
    const confirm = await screen.findByRole('dialog', { name: 'Părăsești familia?' })
    await userEvent.click(within(confirm).getByRole('button', { name: 'Părăsește familia' }))
    expect(await within(region).findByText('Ai părăsit familia.')).toBeDefined()
    expect(within(region).getByRole('button', { name: 'Creează' })).toBeDefined()
  })

  test('the last member is told the family ends', async () => {
    server(family([ana]))
    openSettings()
    const region = await section()
    expect(await within(region).findByText(/Ești ultimul membru/)).toBeDefined()
    await userEvent.click(within(region).getByRole('button', { name: 'Părăsește familia' }))
    const confirm = await screen.findByRole('dialog', { name: 'Părăsești familia?' })
    expect(within(confirm).getByText('Familia se desface. Lunile ei de mâncare devin lunile tale personale.')).toBeDefined()
  })

  test('a failed load can be tried again', async () => {
    let calls = 0
    vi.stubGlobal(
      'fetch',
      vi.fn((path: string) => {
        if (path === '/api/user/me') return answer(200, testAccount)
        if (path === '/api/family') return ++calls === 1 ? failure(500, 'internal') : answer(200, null)
        return answer(200, [])
      }),
    )
    openSettings()
    const region = await section()
    expect(await within(region).findByText(/Familia nu s-a încărcat\./)).toBeDefined()
    await userEvent.click(within(region).getByRole('button', { name: 'Încearcă din nou' }))
    expect(await within(region).findByRole('button', { name: 'Creează' })).toBeDefined()
  })
})

describe('sharing food months', () => {
  test('months without a clash move together, and then the dialog says all is done', async () => {
    const { sent } = server(family([ana, ion]), {
      preview: {
        clean: [
          { monthKey: '2026-10', mine: { totalBani: 150_000, purchaseCount: 1 } },
          { monthKey: '2026-09', mine: { totalBani: 120_000, purchaseCount: 21 } },
        ],
        conflicts: [],
      },
    })
    openSettings()
    const region = await section()
    await userEvent.click(await within(region).findByRole('button', { name: /Partajează lunile mele/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Partajează mâncarea cu familia' })
    expect(await within(dialog).findByText('Octombrie 2026')).toBeDefined()
    expect(within(dialog).getByText('Septembrie 2026')).toBeDefined()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Partajează' }))
    expect(sent('POST', '/api/food/share')).toHaveLength(1)
    expect(await within(dialog).findByText('Toate lunile tale sunt acum ale familiei.')).toBeDefined()
  })

  test('the last member settles clashing months first, then the family ends', async () => {
    const { sent } = server(family([ana]), {
      leaveError: 'family_dissolve_conflicts',
      preview: {
        clean: [],
        conflicts: [
          {
            monthKey: '2026-11',
            mine: { totalBani: 100_000, purchaseCount: 0 },
            family: { totalBani: 150_000, purchaseCount: 1 },
          },
        ],
      },
    })
    openSettings()
    const region = await section()
    await userEvent.click(await within(region).findByRole('button', { name: 'Părăsește familia' }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Părăsește familia' }))
    expect(await within(region).findByText(/se suprapun cu ale familiei/)).toBeDefined()

    await userEvent.click(within(region).getByRole('button', { name: 'Rezolvă lunile' }))
    const dialog = await screen.findByRole('dialog', { name: 'Partajează mâncarea cu familia' })
    expect(await within(dialog).findByText('Noiembrie 2026')).toBeDefined()
    expect(within(dialog).getByText('1 cumpărătură')).toBeDefined()
    expect(within(dialog).getByText('Luna familiei are cumpărături, deci nu poate fi înlocuită.')).toBeDefined()
    expect(within(dialog).getByRole('button', { name: 'Păstrează-o pe a mea' })).toHaveProperty('disabled', true)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Păstrează-o pe a familiei' }))
    expect(sent('POST', '/api/food/share/resolve')).toEqual([{ monthKey: '2026-11', resolution: 'keep_theirs' }])
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Gata' }))

    await userEvent.click(within(region).getByRole('button', { name: 'Părăsește familia' }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Părăsește familia' }))
    expect(await within(region).findByText('Ai părăsit familia.')).toBeDefined()
  })
})
