#!/usr/bin/env bash
# Starts an isolated, disposable Supabase-compatible stack for integration and e2e tests
# WITHOUT Docker: PostgreSQL 15+/16 + GoTrue (supabase/auth) + PostgREST + a tiny gateway.
# If you have Docker, `supabase start` is the simpler option (see README).
#
# Required on PATH or via env: PG_BIN (dir with initdb/pg_ctl), GOTRUE_BIN, POSTGREST_BIN.
# Usage: bash scripts/local-stack/start.sh   (writes .localstack/env with URL and keys)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
STATE="$ROOT/.localstack"
PG_BIN="${PG_BIN:-$(dirname "$(command -v initdb 2>/dev/null || echo /usr/lib/postgresql/16/bin/initdb)")}"
GOTRUE_BIN="${GOTRUE_BIN:-gotrue}"
POSTGREST_BIN="${POSTGREST_BIN:-postgrest}"
GOTRUE_MIGRATIONS="${GOTRUE_MIGRATIONS:-$(dirname "$(command -v "$GOTRUE_BIN")")/migrations}"
PGPORT="${PGPORT:-54322}"
JWT_SECRET="${LOCAL_JWT_SECRET:-travelx-local-test-secret-at-least-32-characters}"
RUN_AS="${RUN_AS:-}"   # set to an unprivileged user when running as root (initdb refuses root)
SITE_URL="${SITE_URL:-http://localhost:3000}"

as_user() { if [ -n "$RUN_AS" ]; then su "$RUN_AS" -c "$*"; else bash -c "$*"; fi; }

mkdir -p "$STATE"
if [ -n "$RUN_AS" ]; then chown "$RUN_AS" "$STATE"; fi
if [ -f "$STATE/pids" ]; then bash "$ROOT/scripts/local-stack/stop.sh" || true; fi
rm -rf "$STATE/data"
as_user "'$PG_BIN/initdb' -D '$STATE/data' -U postgres --auth=trust >/dev/null"
as_user "'$PG_BIN/pg_ctl' -D '$STATE/data' -o '-p $PGPORT -k /tmp -c listen_addresses=127.0.0.1' -l '$STATE/pg.log' -w start >/dev/null"

PSQL="psql -v ON_ERROR_STOP=1 -q -h 127.0.0.1 -p $PGPORT -U postgres -d postgres"
$PSQL -f "$ROOT/scripts/local-stack/bootstrap.sql"

export GOTRUE_JWT_SECRET="$JWT_SECRET" GOTRUE_JWT_EXP=3600 GOTRUE_JWT_AUD=authenticated GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated \
  GOTRUE_DB_DRIVER=postgres DATABASE_URL="postgres://supabase_auth_admin:postgres@127.0.0.1:$PGPORT/postgres?search_path=auth" \
  GOTRUE_DB_NAMESPACE=auth GOTRUE_SITE_URL="$SITE_URL" GOTRUE_URI_ALLOW_LIST="$SITE_URL/**" API_EXTERNAL_URL="http://127.0.0.1:54321/auth/v1" \
  GOTRUE_API_HOST=127.0.0.1 PORT=9999 GOTRUE_DISABLE_SIGNUP=false GOTRUE_EXTERNAL_EMAIL_ENABLED=true \
  GOTRUE_MAILER_AUTOCONFIRM=true GOTRUE_SMTP_ADMIN_EMAIL=noreply@travelx.local GOTRUE_RATE_LIMIT_EMAIL_SENT=1000 \
  GOTRUE_RATE_LIMIT_TOKEN_REFRESH=10000 GOTRUE_RATE_LIMIT_VERIFY=10000 GOTRUE_LOG_LEVEL=warn GOTRUE_DB_MIGRATIONS_PATH="$GOTRUE_MIGRATIONS"
(cd "$(dirname "$GOTRUE_MIGRATIONS")" && "$GOTRUE_BIN" migrate > "$STATE/auth-migrate.log" 2>&1) || { echo "GoTrue migration failed"; tail -20 "$STATE/auth-migrate.log"; exit 1; }
(cd "$(dirname "$GOTRUE_MIGRATIONS")" && exec nohup "$GOTRUE_BIN" serve < /dev/null > "$STATE/auth.log" 2>&1) &
echo $! >> "$STATE/pids"
for i in $(seq 1 60); do curl -sf http://127.0.0.1:9999/health >/dev/null && break; sleep 0.5; done
curl -sf http://127.0.0.1:9999/health >/dev/null || { echo "GoTrue failed to start"; tail -20 "$STATE/auth.log"; exit 1; }

$PSQL -f "$ROOT/scripts/local-stack/post-auth.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do $PSQL -f "$f"; done

cat > "$STATE/postgrest.conf" <<CONF
db-uri = "postgres://authenticator:postgres@127.0.0.1:$PGPORT/postgres"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "$JWT_SECRET"
server-host = "127.0.0.1"
server-port = 3001
db-max-rows = 1000
CONF
nohup "$POSTGREST_BIN" "$STATE/postgrest.conf" < /dev/null > "$STATE/rest.log" 2>&1 & echo $! >> "$STATE/pids"
nohup node "$ROOT/scripts/local-stack/gateway.mjs" < /dev/null > "$STATE/gateway.log" 2>&1 & echo $! >> "$STATE/pids"
for i in $(seq 1 40); do curl -s -o /dev/null http://127.0.0.1:54321/rest/v1/ && break; sleep 0.5; done

eval "$(LOCAL_JWT_SECRET="$JWT_SECRET" node "$ROOT/scripts/local-stack/keys.mjs")"
cat > "$STATE/env" <<ENV
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=$SERVICE_KEY
TEST_DATABASE_URL=postgres://postgres@127.0.0.1:$PGPORT/postgres
NEXT_PUBLIC_SITE_URL=$SITE_URL
ENV
echo "Local stack ready. Environment written to .localstack/env"
