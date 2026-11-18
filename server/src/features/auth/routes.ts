import { Router } from 'express'
import { z } from 'zod'
import type { Config } from '../../config.ts'
import type { Database } from '../../db.ts'
import type { Mailer } from '../../email/mailer.ts'
import { verifyEmail } from '../../email/templates.ts'
import { badRequest, forbidden, unauthorized } from '../../http/errors.ts'
import { validate } from '../../http/validate.ts'
import type { Logger } from '../../lib/log.ts'
import { findUser } from '../user/repository.ts'
import { confirmEmail } from './confirmation.ts'
import { mayEmail } from './email-limits.ts'
import { PASSWORD_MAX_LENGTH, passwordProblem } from './password.ts'
import { currentSession, requireAuth } from './require-auth.ts'
import * as auth from './service.ts'
import {
  clearSessionCookie,
  clearSignupCookie,
  readSessionToken,
  readSignupHash,
  setSessionCookie,
  setSignupCookie,
} from './session.ts'
import * as repo from './repository.ts'
import { issueToken, rearmToken } from './tokens.ts'

// The language the web app is shown in; emails sent for the request use it.
const language = z.enum(['ro', 'en']).default('ro')

const registerBody = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email().max(320)),
  // Length and character rules are checked by passwordProblem, with their own code.
  password: z.string(),
  displayName: z.string().trim().min(1).max(256),
  language,
})

const loginBody = z.object({
  email: z.string().trim().toLowerCase().min(1).max(320),
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
})

const emailBody = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email().max(320)),
  language,
})

const verifyBody = z.object({
  // The shape is checked by the tokens module, so a mangled link gets `invalid_token`.
  token: z.string().max(200),
  // Needed only where the link was not asked for (confirmation.ts).
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH).optional(),
})

interface AuthDeps {
  db: Database
  config: Config
  mailer: Mailer
}

export function authRoutes({ db, config, mailer }: AuthDeps): Router {
  const router = Router()

  /* For work whose cost depends on whether the address has an account: it runs
     once the answer has gone out, so the answer's timing cannot tell. Emails
     are not waited for either, so a slow mail server delays no one. */
  const afterAnswer = (log: Logger, work: () => void) => {
    setImmediate(() => {
      try {
        work()
      } catch (error) {
        log.error({ err: error }, 'auth.email_flow_failed')
      }
    })
  }

  // With email off there is no link to send; the web app explains instead.
  const requireEmail = () => {
    if (!config.email) throw forbidden('email_disabled', 'This server does not send email.')
  }

  const sendConfirmation = (
    to: string,
    displayName: string,
    lang: 'ro' | 'en',
    userId: string,
    browserHash: string,
  ) => {
    const token = issueToken(db, userId, 'email_verification', browserHash)
    const url = `${config.appUrl}/verifica-email#token=${token}`
    void mailer.send('verify_email', { to, ...verifyEmail(lang, { displayName, url }) })
  }

  // What the sign-in page needs to know about this server.
  router.get('/status', (_req, res) => {
    res.json({ registrationsEnabled: config.registrationsEnabled, emailEnabled: config.email !== null })
  })

  /* The answer is the same whether or not the address already has an
     account. With email on, a new account is confirmed through a link before
     it can sign in; with email off it is ready at once. */
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
    // Set whether or not the address was free, so the answer stays the same.
    const browserHash = config.email ? setSignupCookie(res, config) : null
    const result = await auth.register(db, req.log, body, { verified: config.email === null })
    res.status(201).json({ ok: true })

    if (!browserHash || !result.created) return
    afterAnswer(req.log, () => {
      if (mayEmail(db, req.log, result.userId, 'verification') !== 'yes') return
      sendConfirmation(body.email, body.displayName, body.language, result.userId, browserHash)
    })
  })

  /* A new confirmation link, for this browser. The answer is the same for
     every address; only an unconfirmed account gets an email, within the
     limits (email-limits.ts). Past the daily limit the newest link already
     sent works for another day instead, so whoever floods an address cannot
     stop its owner from using the latest email in the inbox. */
  router.post('/resend-verification', (req, res) => {
    requireEmail()
    const body = validate(emailBody, req.body)
    const browserHash = setSignupCookie(res, config)
    res.json({ ok: true })

    afterAnswer(req.log, () => {
      const account = repo.findCredentials(db, body.email)
      if (!account || account.emailVerified) return
      const allowed = mayEmail(db, req.log, account.id, 'verification')
      if (allowed === 'day_limit' && rearmToken(db, account.id, 'email_verification')) {
        req.log.info({ userId: account.id }, 'auth.link_rearmed')
      }
      if (allowed !== 'yes') return
      sendConfirmation(account.email, account.displayName, body.language, account.id, browserHash)
      req.log.info({ userId: account.id }, 'auth.verification_resent')
    })
  })

  /* Answers { user }, signed in, in the browser that registered or with the
     account's password. Anywhere else without the password it answers
     { user: null, passwordRequired: true }, the link stays unused, and the web
     app asks for the password. */
  router.post('/verify-email', async (req, res) => {
    const body = validate(verifyBody, req.body)
    const confirmed = await confirmEmail(db, req.log, body.token, readSignupHash(req, config), body.password ?? null)
    if (!confirmed) {
      res.json({ user: null, passwordRequired: true })
      return
    }
    setSessionCookie(res, config, confirmed.sessionToken)
    clearSignupCookie(res, config)
    res.json({ user: findUser(db, confirmed.userId) })
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

  // Ends every session of the account, on every device, this one included.
  router.post('/logout-all', requireAuth(db, config), (req, res) => {
    const { userId } = currentSession(res)
    auth.logoutEverywhere(db, userId)
    req.log.info({ userId }, 'auth.logout_all')
    clearSessionCookie(res, config)
    res.json({ ok: true })
  })

  return router
}
