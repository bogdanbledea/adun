import { Router } from 'express'
import type { Config } from '../../config.ts'
import type { Database } from '../../db.ts'
import { currentSession, requireAuth } from '../auth/require-auth.ts'
import { requireRecentPassword } from '../auth/step-up.ts'
import { exportData } from './export.ts'

/* /api/data: a user's own data as one file, to keep or take elsewhere. */
export function dataRoutes({ db, config }: { db: Database; config: Config }): Router {
  const router = Router()
  router.use(requireAuth(db, config))

  // Everything leaves the server, so the password is asked for first. A POST,
  // since it uses up that confirmation, and the same-origin guard skips GETs.
  router.post('/export', (req, res) => {
    const { userId } = currentSession(res)
    requireRecentPassword(db, res)
    const file = exportData(db, userId)
    req.log.info({ userId }, 'data.exported')
    res.attachment(`adun-export-${file.exportedAt.slice(0, 10)}.json`)
    res.json(file)
  })

  return router
}
