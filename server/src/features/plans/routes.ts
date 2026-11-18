import { Router } from 'express'
import { z } from 'zod'
import type { Config } from '../../config.ts'
import type { Database } from '../../db.ts'
import { validate } from '../../http/validate.ts'
import { currentSession, requireAuth } from '../auth/require-auth.ts'
import * as plans from './service.ts'

// YYYY-MM, months 01 to 12.
const monthKey = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)
// The client's current month, which decides the instalments already paid.
const monthQuery = z.object({ month: monthKey })
const planParams = z.object({ id: z.uuid() })

// The last instalment's month must still have a four-digit year.
const LAST_MONTH = 9999 * 12 + 11
const monthIndex = (key: string) => Number(key.slice(0, 4)) * 12 + Number(key.slice(5, 7)) - 1

const createPlanBody = z
  .object({
    name: z.string().trim().min(1).max(256),
    installmentCount: z.number().int().min(1).max(360),
    // Whole bani, above zero, up to 9,999,999,999 lei.
    totalBani: z.number().int().min(1).max(999_999_999_900),
    firstMonthKey: monthKey,
    categoryName: z.string().trim().min(1).max(256),
    purchaseDate: z.iso.date().nullable().default(null),
  })
  .refine((body) => monthIndex(body.firstMonthKey) + body.installmentCount - 1 <= LAST_MONTH)

interface Deps {
  db: Database
  config: Config
}

/* /api/plans: payment plans, each with its instalments in the budget. */
export function planRoutes({ db, config }: Deps): Router {
  const router = Router()
  router.use(requireAuth(db, config))

  router.get('/', (req, res) => {
    const { month } = validate(monthQuery, req.query)
    res.json(plans.listPlans(db, currentSession(res).userId, month))
  })

  router.post('/', (req, res) => {
    const { month } = validate(monthQuery, req.query)
    const body = validate(createPlanBody, req.body)
    res.status(201).json(plans.createPlan(db, currentSession(res).userId, body, month))
  })

  router.get('/:id', (req, res) => {
    const { id } = validate(planParams, req.params)
    const { month } = validate(monthQuery, req.query)
    res.json(plans.readPlan(db, currentSession(res).userId, id, month))
  })

  return router
}
