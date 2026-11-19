#!/usr/bin/env bash
# Tests a built image the way compose.yaml runs it:
#   1. data survives `docker rm` + `docker run` with the same volume;
#   2. an image with a new migration applies it after a backup;
#   3. a backup restores into a new volume, and an older image refuses it.
#
# Usage: scripts/container-test.sh [image]        (default adun:dev)
# Needs docker and curl. Uses port 18181 on 127.0.0.1 (ADUN_TEST_PORT).
set -euo pipefail

image=${1:-adun:dev}
port=${ADUN_TEST_PORT:-18181}
name=adun-container-test-$$
volume=$name-data
restored=$name-restored
upgraded=$name:upgraded
work=$(mktemp -d)
base=http://localhost:$port

cleanup() {
  docker rm -f "$name" >/dev/null 2>&1 || true
  docker volume rm "$volume" "$restored" >/dev/null 2>&1 || true
  docker image rm "$upgraded" >/dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT

fail() {
  echo "FAIL: $*" >&2
  docker logs "$name" 2>&1 | tail -20 >&2 || true
  exit 1
}
pass() { echo "ok - $*"; }

hardened=(--read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges:true)

# Runs the image on a volume and waits for the image's own health check.
start() {
  docker run --detach --name "$name" "${hardened[@]}" \
    --env APP_URL="https://localhost:$port" \
    --publish "127.0.0.1:$port:8080" \
    --volume "$2:/data" \
    "$1" >/dev/null
  for _ in $(seq 1 60); do
    case $(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$name") in
      healthy) return ;;
      unhealthy) fail "$1 reported unhealthy" ;;
    esac
    sleep 1
  done
  fail "$1 did not become healthy"
}

stop_and_remove() {
  docker stop "$name" >/dev/null
  [ "$(docker inspect --format '{{.State.ExitCode}}' "$name")" = 0 ] || fail "server did not stop cleanly"
  docker rm "$name" >/dev/null
}

# A same-origin JSON request, as the web app makes it. Prints the status code.
api() {
  local method=$1 path=$2 body=${3:-}
  curl --silent --output "$work/body" --write-out '%{http_code}' \
    --cookie "$work/cookies" --cookie-jar "$work/cookies" \
    --header 'Sec-Fetch-Site: same-origin' --header 'Content-Type: application/json' \
    --request "$method" ${body:+--data "$body"} "$base$path"
}

# ── 1. Data survives removing the container ─────────────────────────────────
docker volume create "$volume" >/dev/null
start "$image" "$volume"
[ "$(api POST /api/auth/register '{"email":"container@example.com","password":"Container-test-1!","displayName":"Ana","language":"ro"}')" = 201 ] \
  || fail "register: $(cat "$work/body")"
[ "$(api POST /api/auth/login '{"email":"container@example.com","password":"Container-test-1!"}')" = 200 ] \
  || fail "login: $(cat "$work/body")"
[ "$(api POST /api/months '{"monthKey":"2026-11"}')" = 201 ] || fail "create month: $(cat "$work/body")"
stop_and_remove

start "$image" "$volume"
[ "$(api GET /api/user/me)" = 200 ] || fail "session lost after docker rm + run"
[ "$(api GET /api/months)" = 200 ] && grep -q '2026-11' "$work/body" || fail "month lost after docker rm + run"
pass "data and sessions survive docker rm + run with the same volume"

# ── 2. An upgrade applies new migrations after a backup ─────────────────────
cat >"$work/9999_container_test.sql" <<'SQL'
CREATE TABLE container_test (id INTEGER PRIMARY KEY) STRICT;
SQL
printf 'FROM %s\nCOPY 9999_container_test.sql /app/server/migrations/\n' "$image" \
  | docker build --quiet --tag "$upgraded" --file - "$work" >/dev/null
stop_and_remove

start "$upgraded" "$volume"
docker logs "$name" 2>&1 | grep -q '"count":1,"latest":"9999_container_test.sql"' \
  || fail "the new migration was not applied at startup"
backup=$(docker exec "$name" sh -c 'ls /data/backups/pre-migration-9999-*.sqlite') || fail "no pre-migration backup"
tables() {
  docker exec "$name" node -e "
    const db = new (require('node:sqlite').DatabaseSync)(process.argv[1], { readOnly: true })
    console.log(db.prepare(\"SELECT count(*) AS n FROM sqlite_schema WHERE name = 'container_test'\").get().n)
  " "$1"
}
[ "$(tables /data/adun.sqlite)" = 1 ] || fail "container_test table missing after upgrade"
[ "$(tables "$backup")" = 0 ] || fail "the backup was taken after the migration"
[ "$(api GET /api/user/me)" = 200 ] || fail "session lost across the upgrade"
pass "upgrade applied migration 9999 and left $(basename "$backup")"
stop_and_remove

# ── 3. A backup restores into a new volume, but not into an older image ─────
start "$upgraded" "$volume"
file=$(docker exec "$name" node src/cli/backup.ts | sed 's/^Backup written to //')
docker exec "$name" cat "$file" >"$work/backup.sqlite"
stop_and_remove

docker volume create "$restored" >/dev/null
restore() {
  docker run --rm --interactive "${hardened[@]}" --env APP_URL="https://localhost:$port" \
    --volume "$restored:/data" "$1" node src/cli/restore.ts - <"$work/backup.sqlite"
}
refusal=$(restore "$image" 2>&1) && fail "the older image restored a newer backup"
grep -q 'from a newer version' <<<"$refusal" || fail "unexpected refusal: $refusal"
restore "$upgraded" >/dev/null || fail "restore refused the backup"
start "$upgraded" "$restored"
[ "$(api GET /api/user/me)" = 200 ] || fail "session lost in the restored volume"
[ "$(api GET /api/months)" = 200 ] && grep -q '2026-11' "$work/body" || fail "month lost in the restored volume"
pass "a backup restores into a new volume, and an older image refuses it"
