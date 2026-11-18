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

const description = z.string().trim().min(1).max(512)
const categoryName = z.string().trim().min(1).max(256)
const type = z.enum(['income', 'expense'])
// Whole bani, up to 9,999,999,999 lei.
const amountBani = z.number().int().min(0).max(999_999_999_900)

const entryParams = z.object({ id: z.uuid() })
const createEntryBody = z.object({ monthKey, categoryName, description, type, amountBani })
// Any of the fields; another month moves the entry there.
const updateEntryBody = createEntryBody.partial().refine((body) => Object.keys(body).length > 0)

interface Deps {
  db: Database
  config: Config
}

/* /api/months: the user's months, each with its entries and totals. */
export function monthRoutes({ db, config }: Deps): Router {
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

/* /api/entries: add, change, move and delete entries. */
export function entryRoutes({ db, config }: Deps): Router {
  const router = Router()
  router.use(requireAuth(db, config))

  router.post('/', (req, res) => {
    const body = validate(createEntryBody, req.body)
    res.status(201).json(budget.createEntry(db, currentSession(res).userId, body))
  })

  router.patch('/:id', (req, res) => {
    const { id } = validate(entryParams, req.params)
    const body = validate(updateEntryBody, req.body)
    res.json(budget.updateEntry(db, currentSession(res).userId, id, body))
  })

  router.delete('/:id', (req, res) => {
    const { id } = validate(entryParams, req.params)
    budget.deleteEntry(db, currentSession(res).userId, id)
    res.json({ ok: true })
  })

  return router
}
