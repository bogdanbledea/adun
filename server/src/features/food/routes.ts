import { Router } from 'express'
import { z } from 'zod'
import type { Config } from '../../config.ts'
import type { Database } from '../../db.ts'
import { validate } from '../../http/validate.ts'
import { currentSession, requireAuth } from '../auth/require-auth.ts'
import * as purchases from './purchases.ts'
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

const purchaseParams = z.object({ id: z.uuid() })

const purchaseFields = {
  // Trimmed, with runs of spaces made one.
  merchant: z
    .string()
    .transform((text) => text.trim().replace(/\s+/g, ' '))
    .pipe(z.string().min(1).max(64)),
  // Whole bani, 0.01 to 100,000 lei.
  amountBani: z.number().int().min(1).max(10_000_000),
  spentOn: z.iso.date(),
  sourceId: z.uuid(),
  // Empty after trimming means no note.
  note: z
    .string()
    .trim()
    .max(256)
    .nullable()
    .transform((text) => text || null),
}
const createPurchaseBody = z.object({ ...purchaseFields, note: purchaseFields.note.default(null) })
const updatePurchaseBody = z
  .object(purchaseFields)
  .partial()
  .refine((body) => Object.keys(body).length > 0)

interface Deps {
  db: Database
  config: Config
}

/* /api/food: food budgets and their purchases. */
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

  router.post('/:monthKey/purchases', (req, res) => {
    const params = validate(monthParams, req.params)
    const body = validate(createPurchaseBody, req.body)
    res.status(201).json(purchases.addPurchase(db, currentSession(res).userId, params.monthKey, body))
  })

  router.delete('/:monthKey/purchases', (req, res) => {
    const params = validate(monthParams, req.params)
    const deleted = purchases.clearPurchases(db, currentSession(res).userId, params.monthKey)
    res.json({ ok: true, deleted })
  })

  router.patch('/purchases/:id', (req, res) => {
    const { id } = validate(purchaseParams, req.params)
    const body = validate(updatePurchaseBody, req.body)
    res.json(purchases.updatePurchase(db, currentSession(res).userId, id, body))
  })

  router.delete('/purchases/:id', (req, res) => {
    const { id } = validate(purchaseParams, req.params)
    purchases.deletePurchase(db, currentSession(res).userId, id)
    res.json({ ok: true })
  })

  return router
}
