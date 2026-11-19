# One image: the API and the built web app. Three stages:
#   web      builds the web app with its full dependencies
#   server   installs the server's production dependencies only
#   runtime  Node, those dependencies, the server source, migrations and the
#            built web files; no npm, runs as the unprivileged `node` user
#
# The server runs its TypeScript directly, so it has no build step. The base
# image is pinned by digest, and Dependabot keeps it current.

FROM node:26.13.1-alpine3.24@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5 AS base

# The built files are the same for every platform, so the web app is built
# once on the build machine's own, even when the image is for another one.
FROM --platform=$BUILDPLATFORM node:26.13.1-alpine3.24@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5 AS web
WORKDIR /build/web
COPY web/package.json web/package-lock.json web/.npmrc ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY web/ ./
# Only what names the current commit, for the footer; no history, no config.
COPY .git/ /build/.git/
RUN npm run build

# Argon2 comes as a prebuilt binary per platform, so this stage runs on the
# image's platform to install the right one.
FROM base AS server
WORKDIR /build/server
COPY server/package.json server/package-lock.json server/.npmrc ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund

FROM base AS runtime
# Package managers are only needed to build; leave none behind.
RUN rm -rf /usr/local/lib/node_modules /usr/local/bin/npm /usr/local/bin/npx \
      /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg /opt/yarn-* \
  && mkdir -p /data && chown node:node /data && chmod 0700 /data

ENV NODE_ENV=production \
    ADUN_DATA_DIR=/data \
    PORT=8080

WORKDIR /app/server
COPY --from=server /build/server/node_modules ./node_modules
COPY server/package.json ./
COPY server/migrations ./migrations
COPY server/src ./src
COPY --from=web /build/web/dist /app/web/dist

USER node
VOLUME ["/data"]
EXPOSE 8080
STOPSIGNAL SIGTERM
# Node's own fetch, so the image needs no curl or wget.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --start-interval=2s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 8080) + '/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]

CMD ["node", "src/index.ts"]
