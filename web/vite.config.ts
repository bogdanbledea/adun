import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// The API listens on its own port in development; Vite forwards to it so the
// browser sees one origin, as in production.
const apiTarget = process.env.ADUN_API_URL ?? 'http://localhost:8080'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': apiTarget,
      '/health': apiTarget,
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
