# Adun

Adun is a budgeting app for a household. The name is Romanian for "I gather".

It is available in Romanian and English.

## What it does

- **Budget** — one page per month with income, expenses and credits grouped
  in categories, and the totals that matter: what came in, what went out,
  what is left. A new month can start empty, as a copy of another month, or
  from a template of the things that repeat every month.
- **Payment plans** — buy something in instalments once, and each instalment
  shows up in the right month until it is paid off.
- **Food** — a monthly food budget, the purchases against it, and how much
  is left for the rest of the week. The month can start on payday instead of
  the 1st.
- **Reminders** — the dates that are easy to forget: car inspection and
  insurance, road tax, gas checks and the like, with an email before they
  are due.
- **Family** — share the food budget with the people you live with.

## Design

Adun is meant to be small, easy to read and easy to host yourself: one
Docker container, one SQLite file, no other services needed.

## Develop

Requires Node.js 26.13.1 (see `.nvmrc`; `nvm use`). Two plain npm packages:

- `server/` is the API, Express run directly from TypeScript, with no build
  step.
- `web/` is the React app, built with Vite.

```sh
cd server && npm install && npm run dev   # API on http://localhost:8080
cd web && npm install && npm run dev      # app on http://localhost:5173
```

The Vite dev server forwards `/api` and `/health` to the API, so the browser
sees a single origin, as in production. Set `ADUN_API_URL` to proxy to an API
on another address.

To run the app the way it is deployed, build the web app; the server then
serves it from `web/dist` alongside the API, on http://localhost:8080:

```sh
cd web && npm run build
cd server && npm start
```

| Package  | Scripts                                                                    |
| -------- | -------------------------------------------------------------------------- |
| `server` | `dev`, `start`, `test` (`node:test`), `check` (types), `lint`, `migrate`   |
| `web`    | `dev`, `build` (to `web/dist`), `test` (Vitest), `check` (types), `lint`   |

## Configure

The server reads these environment variables once at startup and refuses to
start on an invalid value, naming the variable. Empty values count as unset.

| Variable                | Default                 | Meaning                                                           |
| ----------------------- | ----------------------- | ----------------------------------------------------------------- |
| `NODE_ENV`              |                         | `production` when deployed                                        |
| `APP_URL`               | `http://localhost:5173` | Public origin of the app; required, and `https://`, in production |
| `ADUN_DATA_DIR`         | `./data`                | Folder that holds the database                                    |
| `PORT`                  | `8080`                  | Port the server listens on                                        |
| `TRUST_PROXY_HOPS`      | `0`                     | Reverse proxies in front; `1` behind one proxy or tunnel          |
| `REGISTRATIONS_ENABLED` | `true`                  | Set to `false` once everyone who should have an account has one   |
| `LOG_LEVEL`             | `info`                  | `debug`, `info`, `warn` or `error`                                |

Logs go to stdout, one JSON object per line ([pino](https://getpino.io));
`npm run dev` pipes them through `pino-pretty`. Each request is logged with
an ID that is also sent back in the `X-Request-Id` header.

On `SIGTERM` or `SIGINT` the server stops accepting connections, lets
requests in progress finish (10 seconds at most), then closes the database
and exits.

## Data

Everything is kept in one SQLite file, `adun.sqlite`, in `ADUN_DATA_DIR`. The
folder is created readable by its owner only (`0700`, files `0600`). After a
clean stop the file alone is a complete copy of the data.

The schema is built from the numbered SQL files in `server/migrations/`. The
server applies any pending ones at startup; `npm run migrate` applies them
without starting it.

## License

Adun is free software under the GNU Affero General Public License v3.0. See
[LICENSE](LICENSE). In short: you can use, change and host it, and if you let
other people use a changed version over a network, you share your changes
under the same license.
