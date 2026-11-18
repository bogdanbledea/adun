# Adun

Adun is a budgeting app for a household. The name is Romanian for "I gather".

It is available in Romanian and English.

> This project is open source because you shouldn't pay money for an app that
> helps you save money.

## Host it yourself, or use ours

Adun is made to be self-hosted: run it on your own server, for yourself and
the people you live with, and your data stays with you. Everything needed to
run it is in this repository.

If you would rather not run a server, there will also be a hosted Adun that
you can simply sign up to. It is not in production yet.

## What it does

- **Budget** — one page per month with income and expenses grouped in
  categories, and the totals that matter: what came in, what went out, what
  is left. A new month can start empty, as a copy of another month, or
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

| Package  | Scripts                                                                                     |
| -------- | ------------------------------------------------------------------------------------------- |
| `server` | `dev`, `start`, `test` (`node:test`), `check` (types), `lint`, `migrate`, `send-test-email` |
| `web`    | `dev`, `build` (to `web/dist`), `test` (Vitest), `check` (types), `lint`                    |

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

## Email

Email is optional and off by default. Setting `SMTP_HOST` turns it on, and it
works with any SMTP server: your mail provider's relay, a Gmail account, or a
server of your own.

With email on, a new account confirms its address through a link before the
first sign-in, and a forgotten password can be replaced through a link valid
for one hour. Registering with an address that already has an account sends
its owner a notice (at most one a day) instead of a link, and changing the
password tells the owner, with a way to ask for a new one. With email off,
accounts work as soon as they are created and passwords cannot be reset by
email.

| Variable          | Default | Meaning                                                     |
| ----------------- | ------- | ----------------------------------------------------------- |
| `SMTP_HOST`       |         | SMTP server; setting it turns email on                      |
| `SMTP_PORT`       | `587`   | `465` connects with TLS; any other port must offer STARTTLS |
| `SMTP_USER`       |         | Sign-in name, if the server asks for one                    |
| `SMTP_PASSWORD`   |         | Its password (with Gmail, an app password)                  |
| `EMAIL_FROM`      |         | Address emails are sent from; required with `SMTP_HOST`     |
| `EMAIL_FROM_NAME` | `adun`  | Name shown as the sender                                    |

Mail is never sent unencrypted: a server that offers no TLS gets no message.
Setting any of these without `SMTP_HOST`, or a user without a password, stops
startup. To check the settings, send one email:

```sh
cd server
SMTP_HOST=smtp.gmail.com SMTP_PORT=465 SMTP_USER=you@gmail.com \
SMTP_PASSWORD='app password' EMAIL_FROM=you@gmail.com \
npm run send-test-email -- you@example.com
```

## Data

Everything is kept in one SQLite file, `adun.sqlite`, in `ADUN_DATA_DIR`. The
folder is created readable by its owner only (`0700`, files `0600`). After a
clean stop the file alone is a complete copy of the data.

The schema is built from the numbered SQL files in `server/migrations/`. The
server applies any pending ones at startup; `npm run migrate` applies them
without starting it.

Amounts are kept as whole bani (1 leu = 100 bani), so totals are exact. To
keep any one account from filling the disk, an account holds at most 600
budget months, each with up to 200 categories and 500 entries.

At startup and then once a day the server removes what it no longer needs:
activity history older than 365 days, ended sessions, used or expired email
links, and email send records older than a day.

## License

Adun is free software under the GNU Affero General Public License v3.0. See
[LICENSE](LICENSE). In short: you can use, change and host it, and if you let
other people use a changed version over a network, you share your changes
under the same license.
