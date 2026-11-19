import { Router } from 'express'
import { z } from 'zod'
import type { Config } from '../../config.ts'
import type { Database } from '../../db.ts'
import { validate } from '../../http/validate.ts'
import { currentSession, requireAuth } from '../auth/require-auth.ts'
import * as family from './service.ts'

const nameBody = z.object({ name: z.string().trim().min(1).max(128) })
const ownerBody = z.object({ userId: z.uuid() })
const joinBody = z.object({ code: z.string().max(32) })

/* /api/family: the user's family, its invite codes, joining and leaving, and
   handing on the owner role. */
export function familyRoutes({ db, config }: { db: Database; config: Config }): Router {
  const router = Router()
  router.use(requireAuth(db, config))

  // The family with its members, or null when the user is in none.
  router.get('/', (_req, res) => {
    res.json(family.familyView(db, currentSession(res).userId))
  })

  router.post('/', (req, res) => {
    const { name } = validate(nameBody, req.body)
    res.status(201).json(family.createFamily(db, currentSession(res).userId, name))
  })

  router.patch('/', (req, res) => {
    const { name } = validate(nameBody, req.body)
    res.json(family.renameFamily(db, currentSession(res).userId, name))
  })

  // The code is in the answer only this once.
  router.post('/invites', (_req, res) => {
    res.status(201).json(family.createInvite(db, currentSession(res).userId))
  })

  // Rate-limited per address in app.ts, against guessing codes.
  router.post('/join', (req, res) => {
    const { code } = validate(joinBody, req.body)
    res.status(201).json(family.joinFamily(db, currentSession(res).userId, code))
  })

  router.post('/leave', (_req, res) => {
    res.json({ ok: true, ...family.leaveFamily(db, currentSession(res).userId) })
  })

  router.post('/owner', (req, res) => {
    const { userId } = validate(ownerBody, req.body)
    res.json(family.transferOwnership(db, currentSession(res).userId, userId))
  })

  return router
}
