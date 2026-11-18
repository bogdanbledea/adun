import { Router } from 'express'
import { z } from 'zod'
import type { Config } from '../../config.ts'
import type { Database } from '../../db.ts'
import { validate } from '../../http/validate.ts'
import { currentSession, requireAuth } from '../auth/require-auth.ts'
import { deleteUserActivity, listActivity } from './repository.ts'

const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
})

export function activityRoutes({ db, config }: { db: Database; config: Config }): Router {
  const router = Router()
  router.use(requireAuth(db, config))

  // Newest first, a page at a time.
  router.get('/', (req, res) => {
    const { limit, offset } = validate(listQuery, req.query)
    res.json(listActivity(db, currentSession(res).userId, limit, offset))
  })

  // Erases the history only; nothing else changes.
  router.delete('/', (req, res) => {
    const { userId } = currentSession(res)
    const count = deleteUserActivity(db, userId)
    req.log.info({ userId, count }, 'activity.deleted')
    res.json({ ok: true })
  })

  return router
}
