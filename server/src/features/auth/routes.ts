import { Router } from 'express'
import { z } from 'zod'
import type { Config } from '../../config.ts'
import type { Database } from '../../db.ts'
import { badRequest, forbidden, unauthorized } from '../../http/errors.ts'
import { validate } from '../../http/validate.ts'
import { findUser } from '../user/repository.ts'
import { PASSWORD_MAX_LENGTH, passwordProblem } from './password.ts'
import * as auth from './service.ts'
import { clearSessionCookie, readSessionToken, setSessionCookie } from './session.ts'

const registerBody = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email().max(320)),
  // Length and character rules are checked by passwordProblem, with their own code.
  password: z.string(),
  displayName: z.string().trim().min(1).max(256),
  acceptPrivacyVersion: z.string().trim().min(1).max(16),
})

const loginBody = z.object({
  email: z.string().trim().toLowerCase().min(1).max(320),
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
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

  router.post('/login', async (req, res) => {
    const body = validate(loginBody, req.body)
    const { userId, token } = await auth.login(db, req.log, body.email, body.password)
    const user = findUser(db, userId)
    if (!user) throw unauthorized()
    setSessionCookie(res, config, token)
    res.json(user)
  })

  // Works with or without a live session; the cookie is cleared either way.
  router.post('/logout', (req, res) => {
    const token = readSessionToken(req, config)
    if (token) auth.logout(db, token)
    clearSessionCookie(res, config)
    res.json({ ok: true })
  })

  return router
}
