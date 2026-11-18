import type { RequestHandler } from 'express'
import helmet from 'helmet'

// The CSP is written for the built web app: no inline scripts or styles at all.
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      fontSrc: ["'self'"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'none'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
    },
  },
  strictTransportSecurity: { maxAge: 365 * 24 * 60 * 60, includeSubDomains: true },
  referrerPolicy: { policy: 'no-referrer' },
})

// API responses hold personal data; no browser or proxy may keep them.
export const noStore: RequestHandler = (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store')
  next()
}
