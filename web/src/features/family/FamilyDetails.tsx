import { Crown, LogOut, Pencil } from 'lucide-react'
import { useState } from 'react'
import { errorText } from '../../lib/api.ts'
import { useAuth } from '../../lib/auth.tsx'
import { useT } from '../../lib/i18n.tsx'
import { Button } from '../../ui/Button.tsx'
import { ConfirmDialog } from '../../ui/Dialog.tsx'
import { Notice } from '../../ui/Notice.tsx'
import { counted } from '../food/food-format.ts'
import { SettingRow } from '../settings/SettingsSection.tsx'
import { familyApi, type Family, type FamilyMember } from './family-api.ts'
import { InvitePanel } from './InvitePanel.tsx'
import { RenameFamilyDialog } from './RenameFamilyDialog.tsx'

/* In a family: its name and members, the owner's controls (rename, invite,
   hand over the role), and leaving. The server decides who may do what; the
   page only hides what it would refuse. */

type Open = { dialog: 'rename' | 'leave' } | { dialog: 'transfer'; member: FamilyMember } | null

interface FamilyDetailsProps {
  family: Family
  onChanged: (family: Family) => void
  onLeft: () => void
}

export function FamilyDetails({ family, onChanged, onLeft }: FamilyDetailsProps) {
  const t = useT()
  const { state } = useAuth()
  const viewerId = state.status === 'signed_in' ? state.user.id : null
  const [open, setOpen] = useState<Open>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  const isOwner = family.role === 'owner'
  const alone = family.members.length === 1
  const mustTransfer = isOwner && !alone

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (failure) {
      setError(failure)
    } finally {
      setBusy(false)
      setOpen(null)
    }
  }

  const leave = () =>
    run(async () => {
      await familyApi.leave()
      onLeft()
    })

  const transfer = (member: FamilyMember) =>
    run(async () => {
      onChanged(await familyApi.transfer(member.userId))
    })

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3">
        <div className="min-w-0 flex-1 basis-64">
          <p className="text-xl font-semibold text-brand-deep">{family.name}</p>
          <p className="text-sm text-muted">{counted(t, 'family.count.members', family.members.length)}</p>
        </div>
        {isOwner && (
          <Button variant="secondary" onClick={() => { setOpen({ dialog: 'rename' }) }}>
            <Pencil />
            {t('family.rename')}
          </Button>
        )}
      </div>

      <ul className="divide-y divide-line border-y border-line" aria-label={t('family.section')}>
        {family.members.map((member) => (
          <li key={member.userId} className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 py-2">
            <span className="min-w-0 flex-1 truncate">
              <span className="font-semibold">{member.displayName}</span>
              {member.userId === viewerId && <span className="text-muted"> {t('family.you')}</span>}
            </span>
            <span className="inline-flex items-center gap-1 text-sm text-muted">
              {member.role === 'owner' && <Crown aria-hidden="true" className="size-4 text-gold" />}
              {member.role === 'owner' ? t('family.owner') : t('family.member')}
            </span>
            {isOwner && member.role !== 'owner' && (
              <Button
                variant="quiet"
                aria-label={t('family.makeOwnerLabel', { name: member.displayName })}
                onClick={() => { setOpen({ dialog: 'transfer', member }) }}
              >
                {t('family.makeOwner')}
              </Button>
            )}
          </li>
        ))}
      </ul>

      {isOwner && <InvitePanel />}

      <SettingRow
        title={t('family.leave')}
        description={mustTransfer ? t('family.leaveTextOwner') : alone ? t('family.leaveTextLast') : t('family.leaveText')}
      >
        <Button variant="danger" disabled={mustTransfer || busy} onClick={() => { setOpen({ dialog: 'leave' }) }}>
          <LogOut />
          {t('family.leave')}
        </Button>
      </SettingRow>

      {error !== null && <Notice tone="error">{errorText(error, t)}</Notice>}

      {open?.dialog === 'rename' && (
        <RenameFamilyDialog
          family={family}
          onClose={() => { setOpen(null) }}
          onSaved={(next) => {
            setOpen(null)
            onChanged(next)
          }}
        />
      )}
      <ConfirmDialog
        open={open?.dialog === 'leave'}
        title={t('family.leaveConfirmTitle')}
        confirmLabel={t('family.leave')}
        destructive
        busy={busy}
        onConfirm={() => void leave()}
        onCancel={() => { setOpen(null) }}
      >
        {alone ? t('family.leaveConfirmTextLast') : t('family.leaveConfirmText')}
      </ConfirmDialog>
      <ConfirmDialog
        open={open?.dialog === 'transfer'}
        title={t('family.transferTitle')}
        confirmLabel={t('family.transferConfirm')}
        busy={busy}
        onConfirm={() => { if (open?.dialog === 'transfer') void transfer(open.member) }}
        onCancel={() => { setOpen(null) }}
      >
        {open?.dialog === 'transfer' && t('family.transferText', { name: open.member.displayName })}
      </ConfirmDialog>
    </>
  )
}
