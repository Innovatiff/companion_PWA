#!/usr/bin/env bash
# Apply every migration in order against a throwaway database.
# Usage: PGHOST=/tmp PGPORT=55432 PGUSER=postgres ./run-migrations.sh [dbname]
set -euo pipefail
DB="${1:-leamington_test}"
HERE="$(cd "$(dirname "$0")" && pwd)"

# LOCAL ONLY. This script DROPS and recreates the database and installs stub
# auth.uid()/auth.role() functions. Against Supabase those stubs would overwrite
# the real auth helpers every RLS policy depends on. Refuse anything non-local.
#
# For a managed database use scripts/apply-migrations.sh (or packages/db/migrate.sh).
for var in DATABASE_URL PGHOST; do
  val="${!var:-}"
  case "$val" in
    ""|localhost|127.0.0.1|::1|/tmp|/var/run/postgresql) ;;
    *)
      echo "REFUSING: $var points at '$val', which is not local." >&2
      echo "  run-migrations.sh drops the database and installs stub auth functions." >&2
      echo "  For a managed database use: ./scripts/apply-migrations.sh" >&2
      exit 1 ;;
  esac
done

psql -v ON_ERROR_STOP=1 -q -c "drop database if exists $DB;" postgres
psql -v ON_ERROR_STOP=1 -q -c "create database $DB;" postgres
psql -v ON_ERROR_STOP=1 -q -f "$HERE/00_local_supabase_stubs.sql" "$DB"

for f in "$HERE"/../migrations/*.sql; do
  echo "-- applying $(basename "$f")"
  psql -v ON_ERROR_STOP=1 -q -f "$f" "$DB"
done
echo "OK: all migrations applied to $DB"
