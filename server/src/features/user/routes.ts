import { Router } from 'express'
import type { Config } from '../../config.ts'
import type { Database } from '../../db.ts'
import { notFound } from '../../http/errors.ts'
import { currentSession, requireAuth } from '../auth/require-auth.ts'
import { findUser } from './repository.ts'

export function userRoutes({ db, config }: { db: Database; config: Config }): Router {
  const router = Router()
  router.use(requireAuth(db, config))

  router.get('/me', (_req, res) => {
    const user = findUser(db, currentSession(res).userId)
    if (!user) throw notFound()
    res.json(user)
  })

  return router
}
