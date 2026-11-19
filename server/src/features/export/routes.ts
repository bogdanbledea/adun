import express, { Router } from 'express'
import type { Config } from '../../config.ts'
import type { Database } from '../../db.ts'
import { currentSession, requireAuth } from '../auth/require-auth.ts'
import { requireRecentPassword } from '../auth/step-up.ts'
import { exportData } from './export.ts'
import { parseExport } from './format.ts'
import { importData } from './import.ts'

/** Skipped by the app-wide body parser; the route below reads the body. */
export const IMPORT_PATH = '/api/data/import'
// Room for years of a household's data; the account limits come on top.
const IMPORT_LIMIT = '10mb'

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

  // No password: an import only fills an empty account, so it can neither
  // overwrite nor reveal anything. The body is read after requireAuth, so
  // only a signed-in user can send a large one.
  router.post('/import', express.json({ limit: IMPORT_LIMIT }), (req, res) => {
    const { userId } = currentSession(res)
    const counts = importData(db, userId, parseExport(req.body))
    req.log.info({ userId, ...counts }, 'data.imported')
    res.json({ ok: true, imported: counts })
  })

  return router
}
