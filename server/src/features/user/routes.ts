import { Router } from 'express'
import { z } from 'zod'
import type { Config } from '../../config.ts'
import { transaction, type Database } from '../../db.ts'
import { notFound } from '../../http/errors.ts'
import { validate } from '../../http/validate.ts'
import { logActivity } from '../activity/service.ts'
import { currentSession, requireAuth } from '../auth/require-auth.ts'
import { clearSessionCookie } from '../auth/session.ts'
import { requireRecentPassword } from '../auth/step-up.ts'
import { deleteUser, findUser, setDisplayName, setFoodPeriod, setLanguage } from './repository.ts'

// Other fields, such as the email address, are ignored.
const profileBody = z
  .object({
    displayName: z.string().trim().min(1).max(256),
    // The language the web app is shown in, for the emails sent later.
    language: z.enum(['ro', 'en']),
    // When a food month's money starts.
    foodPeriodRule: z.enum(['calendar', 'working_day']),
    foodPaydayWorkingDay: z.number().int().min(1).max(10),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0)

export function userRoutes({ db, config }: { db: Database; config: Config }): Router {
  const router = Router()
  router.use(requireAuth(db, config))

  router.get('/me', (_req, res) => {
    const user = findUser(db, currentSession(res).userId)
    if (!user) throw notFound()
    res.json(user)
  })

  router.patch('/me', (req, res) => {
    const { userId } = currentSession(res)
    const { displayName, language, foodPeriodRule, foodPaydayWorkingDay } = validate(profileBody, req.body)
    const user = transaction(db, () => {
      const current = findUser(db, userId)
      if (!current) return null
      if (language) setLanguage(db, userId, language)
      if (foodPeriodRule !== undefined || foodPaydayWorkingDay !== undefined) {
        const period = {
          rule: foodPeriodRule ?? current.foodPeriodRule,
          paydayWorkingDay: foodPaydayWorkingDay ?? current.foodPaydayWorkingDay,
        }
        if (setFoodPeriod(db, userId, period)) logActivity(db, userId, 'food.period_rule_set', period)
      }
      if (displayName !== undefined && setDisplayName(db, userId, displayName)) logActivity(db, userId, 'account.renamed')
      return findUser(db, userId)
    })
    if (!user) throw notFound()
    req.log.info({ userId }, 'user.profile_updated')
    res.json(user)
  })

  // Everything the account holds goes at once; nothing is kept.
  router.delete('/', (req, res) => {
    const { userId } = currentSession(res)
    requireRecentPassword(db, res)
    if (!deleteUser(db, userId)) throw notFound()
    req.log.warn({ userId }, 'user.account_deleted')
    clearSessionCookie(res, config)
    res.json({ ok: true })
  })

  return router
}
