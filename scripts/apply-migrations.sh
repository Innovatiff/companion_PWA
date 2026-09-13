#!/usr/bin/env bash
#
# Apply database migrations to whatever DATABASE_URL points at.
#
# Reads DATABASE_URL from the environment; no connection details are hardcoded.
# Works against Supabase, Railway, or a local Postgres without editing the file.
#
#   export DATABASE_URL='postgresql://...pooler.supabase.com:6543/postgres?sslmode=no-verify'
#   ./scripts/apply-migrations.sh                # apply pending migrations
#   ./scripts/apply-migrations.sh --dry-run      # list what would be applied
#   ./scripts/apply-migrations.sh --preflight    # read-only readiness check
#
# Delegates to leamington/packages/db/migrate.sh, which is the single
# implementation: ledger-backed, one transaction per migration, stops on first
# failure, safe to re-run. This wrapper exists so the repo-root path is stable.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB_DIR="$ROOT/leamington/packages/db"

if [ -z "${DATABASE_URL:-}" ]; then
  cat >&2 <<'MSG'
DATABASE_URL is not set.

  export DATABASE_URL='postgresql://USER:PASSWORD@HOST:PORT/postgres?sslmode=no-verify'

  Supabase: Project Settings -> Database -> Connection string (URI).
  Use the pooled connection (port 6543) for application traffic.

  Nothing was applied.
MSG
  exit 2
fi

case "${1:-}" in
  --preflight)
    exec psql "$DATABASE_URL" -f "$DB_DIR/preflight.sql"
    ;;
  --dry-run)
    exec "$DB_DIR/migrate.sh" "$DATABASE_URL" --dry-run
    ;;
  "")
    exec "$DB_DIR/migrate.sh" "$DATABASE_URL"
    ;;
  *)
    echo "usage: $0 [--dry-run|--preflight]" >&2
    exit 2
    ;;
esac
