import { randomUUID } from 'node:crypto'
import express from 'express'
import { pinoHttp } from 'pino-http'
import type { Database } from './db.ts'
import type { Logger } from './lib/log.ts'

export interface AppDeps {
  db: Database
  log: Logger
}

export function createApp({ db, log }: AppDeps): express.Express {
  const app = express()
  app.disable('x-powered-by')

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

  app.get('/health', (req, res) => {
    try {
      db.prepare('SELECT 1').get()
      res.json({ status: 'ok' })
    } catch (error) {
      req.log.error({ err: error }, 'health.database_unavailable')
      res.status(503).json({ status: 'unavailable' })
    }
  })

  return app
}
