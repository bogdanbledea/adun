# Contributing to Adun
 
Thanks for your interest in Adun, a self-hosted household budgeting app available in Romanian and English. Bug reports, fixes, translations, documentation and well-scoped features are all welcome.
 
By contributing, you agree that your contributions are licensed under the [GNU Affero General Public License v3.0](LICENSE), the same license as the rest of the project.
 
## Before you start
 
- **Bugs and small fixes:** open a pull request directly. For anything non-obvious, open an issue first so we can agree on the problem.
- **New features:** please open an issue to discuss it before writing code. Adun is deliberately small and self-hostable, so some ideas may not fit, and it is better to find that out before you spend time on them.
- **Security problems:** do not open a public issue. Report them privately through the repository's **Security** tab ("Report a vulnerability") instead.
## Project layout
 
| Path | What lives there |
| --- | --- |
| `server/` | Express API in TypeScript, backed by a single SQLite file |
| `server/src/features/<name>/` | One folder per feature (`auth`, `budget`, `food`, `family`, `plans`, `reminders`, `export`, `activity`, `user`), each with `routes.ts`, `service.ts` and `repository.ts` |
| `server/src/cli/` | Admin commands: `backup`, `restore`, `migrate`, `reset-password`, `send-test-email` |
| `server/migrations/` | Numbered SQL migrations (see [Database migrations](#database-migrations)) |
| `web/` | React + Vite app |
| `web/src/features/<name>/` | UI for each feature, with its API client (`*-api.ts`) next to it |
| `web/src/i18n/` | Romanian (`ro`) and English (`en`) strings |
| `web/e2e/` | Playwright end-to-end smoke test |
| `scripts/container-test.sh` | Checks a built Docker image |
| `Dockerfile`, `compose.yaml` | Production image and example deployment |
 
## Development setup
 
You need the Node.js version in [`.nvmrc`](.nvmrc) (currently 26.13.1). With [nvm](https://github.com/nvm-sh/nvm):
 
```sh
nvm install
nvm use
```
 
Run the API (port 8080):
 
```sh
cd server
npm install
npm run dev
```
 
Run the web app (port 5173) in a second terminal:
 
```sh
cd web
npm install
npm run dev
```
 
Configuration comes from environment variables. See `.env.example` for the full list. Invalid values stop the server at startup, so a typo shows up immediately. Without `SMTP_HOST` set, no email is sent. Use `npm run reset-password -- user@example.com` in `server/` if you need to get into a local account.
 
To run the app the way it is deployed (the server serves the built web app on port 8080):
 
```sh
cd web && npm run build
cd ../server && npm start
```
 
## Checks to run before opening a pull request
 
CI runs the same checks, so run them locally first. Run each in both `server/` and `web/`:
 
```sh
npm run lint
npm run check
npm test
```
 
| Package | Test runner | Extra |
| --- | --- | --- |
| `server` | `node:test` | |
| `web` | Vitest | `npm run build` must also succeed |
 
CI also runs `npm audit --omit=dev`, builds the Docker image, scans it with Trivy (HIGH and CRITICAL fixable vulnerabilities fail the build), and runs the end-to-end smoke test. To run the end-to-end test yourself:
 
```sh
docker build -t adun:dev .
cd web
npx playwright install chromium
ADUN_E2E_IMAGE=adun:dev npm run e2e
```
 
You can also point it at an already running instance with `ADUN_E2E_URL`.
 
## Making changes
 
1. Fork the repository and create a branch from `main`.
2. Keep each pull request focused on one change. Unrelated cleanups belong in their own pull request.
3. Add or update tests next to the code you change. Tests are colocated (`thing.ts` and `thing.test.ts`). Server tests can use the helpers in `server/test/`, and web tests the helpers in `web/src/test/`.
4. Make sure the checks above pass.
5. Open a pull request against `main` and describe what changed and why. Link the issue it closes, if there is one. For UI changes, include a screenshot.
### Code conventions
 
- Follow the existing structure: routes handle HTTP, services hold the logic, repositories talk to the database. Match the style of the surrounding code, and let ESLint and the TypeScript checks settle formatting questions.
- Keep dependencies to a minimum. Adun is meant to be easy to audit and to self-host, so please raise a new runtime dependency in the issue or pull request description.
- Validate and limit all input on the server. Do not rely on the web app to enforce anything.
### Translations
 
Every user-facing string must exist in both Romanian and English. Add keys to the matching pair of files in `web/src/i18n/` (for example `food.en.ts` and `food.ro.ts`). A change that adds text in only one language is incomplete. Improvements to existing translations are very welcome.
 
### Database migrations
 
Adun stores everything in one SQLite file and applies migrations at startup. The rules, also described in [`server/migrations/README.md`](server/migrations/README.md), are:
 
- Name files `NNNN_description.sql` (lowercase, underscores) using the next free number. They run in numeric order.
- Migrations are append-only. Never edit or renumber one that has been released. Add a new migration instead.
- Do not put `BEGIN` or `COMMIT` in the file. The runner wraps each migration in its own transaction.
- Tables must be `STRICT`.
- Foreign keys are off while a migration runs and are checked before it commits. To change an existing table, create the new one, copy the rows, drop the old one, rename the new one, and recreate its indexes.
Check a migration against a copy of a database that already has data, not only a fresh one. Adun writes a backup before it migrates, but a broken migration still means a bad upgrade for someone.
 
### Privacy and data
 
Adun holds people's household finances. Please:
 
- Never commit `.env` files, SQLite databases, backups or real receipts.
- Use obviously fake data in tests, fixtures and screenshots.
- Do not add analytics, telemetry or calls to third-party services.
## Docker
 
The image runs as the unprivileged `node` user on port 8080 and keeps its data in `/data`. If you change the `Dockerfile` or `compose.yaml`, build the image and run `scripts/container-test.sh <image>` before submitting. `compose.yaml` runs the container read-only with capabilities dropped, so keep it that way.
 
## Releases and dependency updates
 
Releases are made by the maintainer through the `release` workflow, which runs CI and then opens a draft release. Versions follow `MAJOR.MINOR.PATCH`. Please do not bump versions in your pull request.
 
Dependabot opens weekly update pull requests. If you update dependencies by hand, keep `package-lock.json` in sync. CI installs with `npm ci`.
 
## Questions
 
Open an issue if something here is unclear or out of date. Improvements to this guide are welcome too.
 
