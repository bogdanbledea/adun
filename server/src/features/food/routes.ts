import { Router } from 'express'
import { z } from 'zod'
import type { Config } from '../../config.ts'
import type { Database } from '../../db.ts'
import { validate } from '../../http/validate.ts'
import { currentSession, requireAuth } from '../auth/require-auth.ts'
import * as food from './service.ts'

// YYYY-MM from 2024 to 2099, the years whose working calendar is known.
const monthKey = z.string().regex(/^(202[4-9]|20[3-9]\d)-(0[1-9]|1[0-2])$/)
const monthParams = z.object({ monthKey })
// The client's date, which the weekly plan is counted from.
const todayQuery = z.object({ today: z.iso.date() })

const sourcesBody = z.object({
  sources: z
    .array(
      z.object({
        id: z.uuid().optional(),
        name: z.string().trim().min(1).max(64),
        // Whole bani, up to 1,000,000 lei.
        amountBani: z.number().int().min(0).max(100_000_000),
      }),
    )
    .min(1)
    .max(food.MAX_SOURCES),
})

interface Deps {
  db: Database
  config: Config
}

/* /api/food: food budgets. */
export function foodRoutes({ db, config }: Deps): Router {
  const router = Router()
  router.use(requireAuth(db, config))

  router.get('/:monthKey', (req, res) => {
    const params = validate(monthParams, req.params)
    res.json(food.monthState(db, currentSession(res).userId, params.monthKey))
  })

  router.put('/:monthKey/sources', (req, res) => {
    const params = validate(monthParams, req.params)
    const { today } = validate(todayQuery, req.query)
    const { sources } = validate(sourcesBody, req.body)
    res.json(food.saveSources(db, currentSession(res).userId, params.monthKey, { sources, today }))
  })

  router.delete('/:monthKey', (req, res) => {
    const params = validate(monthParams, req.params)
    food.deleteBudget(db, currentSession(res).userId, params.monthKey)
    res.json({ ok: true })
  })

  return router
}
