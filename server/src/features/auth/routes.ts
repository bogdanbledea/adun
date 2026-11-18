import { Router } from 'express'
import { z } from 'zod'
import type { Config } from '../../config.ts'
import type { Database } from '../../db.ts'
import { badRequest, forbidden } from '../../http/errors.ts'
import { validate } from '../../http/validate.ts'
import { passwordProblem } from './password.ts'
import * as auth from './service.ts'

const registerBody = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email().max(320)),
  // Length and character rules are checked by passwordProblem, with their own code.
  password: z.string(),
  displayName: z.string().trim().min(1).max(256),
  acceptPrivacyVersion: z.string().trim().min(1).max(16),
})

export function authRoutes({ db, config }: { db: Database; config: Config }): Router {
  const router = Router()

  // What the sign-in page needs to know about this server.
  router.get('/status', (_req, res) => {
    res.json({ registrationsEnabled: config.registrationsEnabled })
  })

  // The answer is the same whether or not the address already has an account.
  router.post('/register', async (req, res) => {
    if (!config.registrationsEnabled) {
      throw forbidden('registrations_disabled', 'New accounts are not accepted.')
    }
    const body = validate(registerBody, req.body)
    if (passwordProblem(body.password)) {
      throw badRequest(
        'weak_password',
        'The password needs 12 to 200 characters, with lower and upper case letters, a digit and a symbol.',
      )
    }
    await auth.register(db, req.log, body)
    res.status(201).json({ ok: true })
  })

  return router
}
