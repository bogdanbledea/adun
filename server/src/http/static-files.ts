import fs from 'node:fs'
import path from 'node:path'
import express, { type Router } from 'express'

/* Serves the built web app. Vite puts content-hashed files under assets/, so
   they can be cached for a year; index.html and everything else is revalidated
   on each visit. Any other GET that accepts HTML gets index.html, so the
   app's own routes (/buget, /mancare …) work on reload; a missing asset stays
   a 404. */
export function staticFiles(webRoot: string): Router {
  const router = express.Router()
  const index = path.join(webRoot, 'index.html')

  router.use(
    express.static(webRoot, {
      index: false,
      setHeaders: (res, file) => {
        const hashed = path.relative(webRoot, file).startsWith(`assets${path.sep}`)
        res.setHeader('Cache-Control', hashed ? 'public, max-age=31536000, immutable' : 'no-cache')
      },
    }),
  )

  router.get(/.*/, (req, res, next) => {
    if (/^\/(api|assets)\//.test(req.path) || !req.accepts('html') || !fs.existsSync(index)) {
      next()
      return
    }
    res.setHeader('Cache-Control', 'no-cache')
    res.sendFile(index)
  })

  return router
}
