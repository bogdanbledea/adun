import { Router } from 'express'
import { z } from 'zod'
import type { Config } from '../../config.ts'
import type { Database } from '../../db.ts'
import { validate } from '../../http/validate.ts'
import { currentSession, requireAuth } from '../auth/require-auth.ts'
import { REMINDER_KINDS } from './repository.ts'
import * as reminders from './service.ts'

const reminderParams = z.object({ id: z.uuid() })

const year = (date: string) => Number(date.slice(0, 4))
const dueDate = z.iso.date().refine((date) => year(date) >= 2000 && year(date) <= reminders.LAST_YEAR)

const fields = {
  kind: z.enum(REMINDER_KINDS),
  name: z.string().trim().min(1).max(256),
  subject: z.string().trim().min(1).max(128).nullable(),
  dueDate,
  intervalMonths: z.number().int().min(1).max(120).nullable(),
  leadDays: z.array(z.number().int().min(0).max(365)).min(1).max(5),
  notes: z.string().trim().min(1).max(512).nullable(),
}

const createBody = z.object({
  ...fields,
  subject: fields.subject.default(null),
  intervalMonths: fields.intervalMonths.default(null),
  leadDays: fields.leadDays.default(reminders.DEFAULT_LEAD_DAYS),
  notes: fields.notes.default(null),
})
const updateBody = z.object({ ...fields, isActive: z.boolean() }).partial()
const renewBody = z.object({ dueDate: dueDate.optional() })
// The client's date, which a repeating reminder is renewed past.
const todayQuery = z.object({ today: z.iso.date() })

interface Deps {
  db: Database
  config: Config
}

/* /api/reminders: due dates, renewing them when the document is renewed. */
export function reminderRoutes({ db, config }: Deps): Router {
  const router = Router()
  router.use(requireAuth(db, config))

  router.get('/', (_req, res) => {
    res.json(reminders.listReminders(db, currentSession(res).userId))
  })

  router.post('/', (req, res) => {
    const body = validate(createBody, req.body)
    res.status(201).json(reminders.createReminder(db, currentSession(res).userId, body))
  })

  router.patch('/:id', (req, res) => {
    const { id } = validate(reminderParams, req.params)
    const body = validate(updateBody, req.body)
    res.json(reminders.updateReminder(db, currentSession(res).userId, id, body))
  })

  router.post('/:id/renew', (req, res) => {
    const { id } = validate(reminderParams, req.params)
    const { today } = validate(todayQuery, req.query)
    const { dueDate } = validate(renewBody, req.body)
    res.json(reminders.renewReminder(db, currentSession(res).userId, id, { dueDate, today }))
  })

  router.delete('/:id', (req, res) => {
    const { id } = validate(reminderParams, req.params)
    reminders.deleteReminder(db, currentSession(res).userId, id)
    res.json({ ok: true })
  })

  return router
}
