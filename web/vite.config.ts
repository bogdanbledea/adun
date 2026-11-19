import { readFileSync } from 'node:fs'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { configDefaults, defineConfig } from 'vitest/config'

// The API listens on its own port in development; Vite forwards to it so the
// browser sees one origin, as in production.
const apiTarget = process.env.ADUN_API_URL ?? 'http://localhost:8080'

// The footer shows the version and the commit the app was built from. The
// version is the one in package.json, which each release bumps.
const { version } = JSON.parse(readFileSync(new URL('package.json', import.meta.url), 'utf8')) as { version: string }

// The image build has no git, only the few files it copies from .git, so the
// commit is read from them: HEAD names a branch (or is the commit itself when
// detached), and the branch is a file under refs/ or a line in packed-refs.
function gitCommit(): string {
  const git = new URL('../.git/', import.meta.url)
  const read = (path: string) => readFileSync(new URL(path, git), 'utf8').trim()
  try {
    const head = read('HEAD')
    if (!head.startsWith('ref: ')) return head
    const ref = head.slice('ref: '.length)
    try {
      return read(ref)
    } catch {
      const line = read('packed-refs').split('\n').find((entry) => entry.endsWith(` ${ref}`))
      return line?.split(' ')[0] ?? 'unknown'
    }
  } catch {
    return 'unknown'
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __APP_COMMIT__: JSON.stringify(gitCommit()),
  },
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
    // e2e/ holds the Playwright smoke test, run with npm run e2e.
    exclude: [...configDefaults.exclude, 'e2e/**'],
    // Vitest skips stylesheets by default, which would make tokens.test.ts
    // read an empty file through ?raw.
    css: { include: [/tokens\.css/] },
  },
})
