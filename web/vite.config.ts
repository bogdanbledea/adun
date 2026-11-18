import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// The API listens on its own port in development; Vite forwards to it so the
// browser sees one origin, as in production.
const apiTarget = process.env.ADUN_API_URL ?? 'http://localhost:8080'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // Vite inlines files under 4 KB as data: URLs. The server's CSP allows
    // fonts only from 'self' (data: is allowed for images alone), so a small
    // font subset inlined into the CSS would be blocked; fonts stay files.
    assetsInlineLimit: (file) => (/\.(woff2?|ttf|otf)$/.test(file) ? false : undefined),
  },
  server: {
    proxy: {
      '/api': apiTarget,
      '/health': apiTarget,
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // Vitest skips stylesheets by default, which would make tokens.test.ts
    // read an empty file through ?raw.
    css: { include: [/tokens\.css/] },
  },
})
