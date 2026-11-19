import { defineConfig, devices } from '@playwright/test'

/* The smoke test of the built app (npm run e2e). Each run starts a fresh
   container of ADUN_E2E_IMAGE (default adun:dev, built with
   `docker build -t adun:dev .` from the repository root), with no volume,
   and removes it afterwards. ADUN_E2E_URL tests a server already running
   instead, such as `npm start` serving web/dist. */

const port = process.env.ADUN_E2E_PORT ?? '18282'
const image = process.env.ADUN_E2E_IMAGE ?? 'adun:dev'
const externalUrl = process.env.ADUN_E2E_URL
const baseURL = externalUrl ?? `http://localhost:${port}`

export default defineConfig({
  testDir: './e2e',
  // One server, one in-memory rate limiter: the tours run one after another.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 60_000,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: externalUrl
    ? undefined
    : {
        // Run as deployed: production, an https APP_URL, a read-only root and
        // no capabilities. Chromium treats http://localhost as secure, so the
        // __Host- session cookie still works over plain HTTP.
        command: [
          'docker run --rm --read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges:true',
          `--env APP_URL=https://localhost:${port} --publish 127.0.0.1:${port}:8080 ${image}`,
        ].join(' '),
        url: `${baseURL}/health`,
        timeout: 60_000,
        reuseExistingServer: false,
        gracefulShutdown: { signal: 'SIGTERM', timeout: 15_000 },
        stdout: 'ignore',
        stderr: 'pipe',
      },
})
