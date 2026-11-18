import { randomUUID } from 'node:crypto'
import express from 'express'
import { pinoHttp } from 'pino-http'
import type { Config } from './config.ts'
import type { Database } from './db.ts'
import type { Logger } from './lib/log.ts'
import { errorHandler, notFoundHandler } from './http/errors.ts'
import { authLimit, generalLimit } from './http/rate-limits.ts'
import { sameOriginGuard } from './http/same-origin.ts'
import { noStore, securityHeaders } from './http/security.ts'

export interface AppDeps {
  config: Config
  db: Database
  log: Logger
}

// Middleware order and route mounting. The order is part of the security model:
// every response gets a request ID and security headers, and the body limit,
// rate limits and same-origin guard all run before any route.
export function createApp({ config, db, log }: AppDeps): express.Express {
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', config.trustProxyHops)

  // One log line per request, and req.log for handlers, tagged with a request
  // ID that is also sent back to the client. The ID is always our own, never
  // one the client chose.
  app.use(
    pinoHttp({
      logger: log,
      genReqId: (_req, res) => {
        const id = randomUUID()
        res.setHeader('X-Request-Id', id)
        return id
      },
      // Health checks run every few seconds; logging them only adds noise.
      autoLogging: { ignore: (req) => req.url === '/health' },
      customLogLevel: (_req, res, err) => {
        if (err !== undefined || res.statusCode >= 500) return 'error'
        if (res.statusCode >= 400) return 'warn'
        return 'info'
      },
      serializers: {
        // Path only: query strings will carry tokens from email links.
        req: (req: { id: string; method: string; url: string }) => ({
          id: req.id,
          method: req.method,
          path: req.url.split('?')[0],
        }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
    }),
  )
  app.use(securityHeaders)
  app.use('/api', noStore)
  app.use(express.json({ limit: '32kb' }))
  app.use(generalLimit())
  app.use('/api/auth', authLimit())
  app.use('/api', sameOriginGuard(config.appUrl))

  app.get('/health', (req, res) => {
    try {
      db.prepare('SELECT 1').get()
      res.json({ status: 'ok' })
    } catch (error) {
      req.log.error({ err: error }, 'health.database_unavailable')
      res.status(503).json({ status: 'unavailable' })
    }
  })

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
