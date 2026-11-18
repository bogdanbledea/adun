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

Requires Node.js 26.13.1 (see `.nvmrc`; `nvm use`). The server runs its
TypeScript files directly, with no build step.

```sh
cd server
npm install
npm run dev     # http://localhost:8080/health
```

Other scripts: `npm test`, `npm run check` (types) and `npm run lint`.

## Configure

The server reads these environment variables once at startup and refuses to
start on an invalid value, naming the variable. Empty values count as unset.

| Variable    | Default | Meaning                                     |
| ----------- | ------- | ------------------------------------------- |
| `NODE_ENV`  |         | `production` when deployed                  |
| `PORT`      | `8080`  | Port the server listens on                  |
| `LOG_LEVEL` | `info`  | `debug`, `info`, `warn` or `error`          |

Logs go to stdout, one JSON object per line. On `SIGTERM` or `SIGINT` the
server stops accepting connections and lets requests in progress finish (10
seconds at most) before it exits.

## License

Adun is free software under the GNU Affero General Public License v3.0. See
[LICENSE](LICENSE). In short: you can use, change and host it, and if you let
other people use a changed version over a network, you share your changes
under the same license.
