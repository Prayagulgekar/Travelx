#!/usr/bin/env bash
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
STATE="$ROOT/.localstack"
PG_BIN="${PG_BIN:-$(dirname "$(command -v pg_ctl 2>/dev/null || echo /usr/lib/postgresql/16/bin/pg_ctl)")}"
[ -f "$STATE/pids" ] && xargs -r kill < "$STATE/pids" 2>/dev/null; rm -f "$STATE/pids"
if [ -n "${RUN_AS:-}" ]; then su "$RUN_AS" -c "'$PG_BIN/pg_ctl' -D '$STATE/data' -m fast stop" >/dev/null 2>&1
else "$PG_BIN/pg_ctl" -D "$STATE/data" -m fast stop >/dev/null 2>&1; fi
echo "Local stack stopped."
