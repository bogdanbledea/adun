import { Router } from 'express'
import { z } from 'zod'
import type { Config } from '../../config.ts'
import type { Database } from '../../db.ts'
import { validate } from '../../http/validate.ts'
import { LIMITS } from '../../lib/limits.ts'
import { currentSession, requireAuth } from '../auth/require-auth.ts'
import * as copy from './copy.ts'
import * as order from './order.ts'
import * as budget from './service.ts'

// YYYY-MM, months 01 to 12.
const monthKey = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)

const monthParams = z.object({ monthKey })
// Where a month's entries are copied from: another month, or the template.
const source = z.union([monthKey, z.literal('template')])
const createMonthBody = z.object({ monthKey, from: source.optional() })
const importBody = z.object({ from: source })

const description = z.string().trim().min(1).max(512)
const categoryName = z.string().trim().min(1).max(256)
const type = z.enum(['income', 'expense'])
// Whole bani, up to 9,999,999,999 lei.
const amountBani = z.number().int().min(0).max(999_999_999_900)

const entryParams = z.object({ id: z.uuid() })
const createEntryBody = z.object({ monthKey, categoryName, description, type, amountBani })
const createTemplateEntryBody = createEntryBody.omit({ monthKey: true })
// Any of the fields; another month moves the entry there.
const updateEntryBody = createEntryBody.partial().refine((body) => Object.keys(body).length > 0)

// A whole list in its new order, each ID once.
const orderBody = (max: number) =>
  z.object({
    ids: z
      .array(z.uuid())
      .min(1)
      .max(max)
      .refine((ids) => new Set(ids).size === ids.length),
  })
const categoryOrderBody = orderBody(LIMITS.categoriesPerMonth)
const entryOrderBody = orderBody(LIMITS.entriesPerMonth)

interface Deps {
  db: Database
  config: Config
}

/* /api/months: the user's months, each with its entries and totals; a new
   month starts empty or as a copy, and a month can import another's entries. */
export function monthRoutes({ db, config }: Deps): Router {
  const router = Router()
  router.use(requireAuth(db, config))

  router.get('/', (_req, res) => {
    res.json(budget.listMonths(db, currentSession(res).userId))
  })

  router.post('/', (req, res) => {
    const { userId } = currentSession(res)
    const { monthKey, from } = validate(createMonthBody, req.body)
    const month = from ? copy.createMonthFrom(db, userId, monthKey, from) : budget.createMonth(db, userId, monthKey)
    req.log.info({ userId }, 'budget.month_created')
    res.status(201).json(month)
  })

  router.post('/:monthKey/import', (req, res) => {
    const { userId } = currentSession(res)
    const { monthKey } = validate(monthParams, req.params)
    const { from } = validate(importBody, req.body)
    const imported = copy.importInto(db, userId, monthKey, from)
    req.log.info({ userId, entries: imported }, 'budget.month_imported')
    res.json({ imported })
  })

  router.get('/:monthKey', (req, res) => {
    const { monthKey } = validate(monthParams, req.params)
    res.json(budget.readMonth(db, currentSession(res).userId, monthKey))
  })

  router.delete('/:monthKey', (req, res) => {
    const { userId } = currentSession(res)
    const { monthKey } = validate(monthParams, req.params)
    const { entries, keptInstallments } = budget.deleteMonth(db, userId, monthKey)
    req.log.warn({ userId, entries, keptInstallments }, 'budget.month_deleted')
    res.json({ ok: true, cleared: keptInstallments > 0, keptInstallments })
  })

  return router
}

/* /api/categories: a month's categories are added and removed with their
   entries; here they are only put in order. */
export function categoryRoutes({ db, config }: Deps): Router {
  const router = Router()
  router.use(requireAuth(db, config))

  router.put('/order', (req, res) => {
    const { ids } = validate(categoryOrderBody, req.body)
    order.reorderCategories(db, currentSession(res).userId, ids)
    res.json({ ok: true })
  })

  return router
}

/* /api/entries: add, change, move, delete and reorder entries. */
export function entryRoutes({ db, config }: Deps): Router {
  const router = Router()
  router.use(requireAuth(db, config))

  router.put('/order', (req, res) => {
    const { ids } = validate(entryOrderBody, req.body)
    order.reorderEntries(db, currentSession(res).userId, ids)
    res.json({ ok: true })
  })

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

/* /api/template: the template's categories and entries, and adding one. They
   are changed, deleted and reordered through /api/entries and /api/categories. */
export function templateRoutes({ db, config }: Deps): Router {
  const router = Router()
  router.use(requireAuth(db, config))

  router.get('/', (_req, res) => {
    res.json(budget.readTemplate(db, currentSession(res).userId))
  })

  router.post('/entries', (req, res) => {
    const body = validate(createTemplateEntryBody, req.body)
    res.status(201).json(budget.createEntry(db, currentSession(res).userId, { ...body, monthKey: null }))
  })

  return router
}
