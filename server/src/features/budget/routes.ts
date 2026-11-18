import { Router } from 'express'
import { z } from 'zod'
import type { Config } from '../../config.ts'
import type { Database } from '../../db.ts'
import { validate } from '../../http/validate.ts'
import { currentSession, requireAuth } from '../auth/require-auth.ts'
import * as budget from './service.ts'

// YYYY-MM, months 01 to 12.
const monthKey = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)

const monthParams = z.object({ monthKey })
const createMonthBody = z.object({ monthKey })

/* /api/months: the user's months, each with its entries and totals. */
export function monthRoutes({ db, config }: { db: Database; config: Config }): Router {
  const router = Router()
  router.use(requireAuth(db, config))

  router.get('/', (_req, res) => {
    res.json(budget.listMonths(db, currentSession(res).userId))
  })

  router.post('/', (req, res) => {
    const { userId } = currentSession(res)
    const { monthKey } = validate(createMonthBody, req.body)
    const month = budget.createMonth(db, userId, monthKey)
    req.log.info({ userId }, 'budget.month_created')
    res.status(201).json(month)
  })

  router.get('/:monthKey', (req, res) => {
    const { monthKey } = validate(monthParams, req.params)
    res.json(budget.readMonth(db, currentSession(res).userId, monthKey))
  })

  router.delete('/:monthKey', (req, res) => {
    const { userId } = currentSession(res)
    const { monthKey } = validate(monthParams, req.params)
    const entries = budget.deleteMonth(db, userId, monthKey)
    req.log.warn({ userId, entries }, 'budget.month_deleted')
    res.json({ ok: true })
  })

  return router
}
