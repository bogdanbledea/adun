import { Router } from 'express'
import { z } from 'zod'
import type { Config } from '../../config.ts'
import type { Database } from '../../db.ts'
import { notFound } from '../../http/errors.ts'
import { validate } from '../../http/validate.ts'
import { currentSession, requireAuth } from '../auth/require-auth.ts'
import { clearSessionCookie } from '../auth/session.ts'
import { requireRecentPassword } from '../auth/step-up.ts'
import { deleteUser, findUser, setDisplayName } from './repository.ts'

// Other fields, such as the email address, are ignored.
const profileBody = z.object({
  displayName: z.string().trim().min(1).max(256),
})

export function userRoutes({ db, config }: { db: Database; config: Config }): Router {
  const router = Router()
  router.use(requireAuth(db, config))

  router.get('/me', (_req, res) => {
    const user = findUser(db, currentSession(res).userId)
    if (!user) throw notFound()
    res.json(user)
  })

  router.patch('/me', (req, res) => {
    const { userId } = currentSession(res)
    const { displayName } = validate(profileBody, req.body)
    const user = setDisplayName(db, userId, displayName)
    if (!user) throw notFound()
    req.log.info({ userId }, 'user.profile_updated')
    res.json(user)
  })

  // Everything the account holds goes at once; nothing is kept.
  router.delete('/', (req, res) => {
    const { userId } = currentSession(res)
    requireRecentPassword(db, res)
    if (!deleteUser(db, userId)) throw notFound()
    req.log.warn({ userId }, 'user.account_deleted')
    clearSessionCookie(res, config)
    res.json({ ok: true })
  })

  return router
}
