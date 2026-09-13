#!/usr/bin/env bash
# Apply every migration in order against a throwaway database.
# Usage: PGHOST=/tmp PGPORT=55432 PGUSER=postgres ./run-migrations.sh [dbname]
set -euo pipefail
DB="${1:-leamington_test}"
HERE="$(cd "$(dirname "$0")" && pwd)"

psql -v ON_ERROR_STOP=1 -q -c "drop database if exists $DB;" postgres
psql -v ON_ERROR_STOP=1 -q -c "create database $DB;" postgres
psql -v ON_ERROR_STOP=1 -q -f "$HERE/00_local_supabase_stubs.sql" "$DB"

for f in "$HERE"/../migrations/*.sql; do
  echo "-- applying $(basename "$f")"
  psql -v ON_ERROR_STOP=1 -q -f "$f" "$DB"
done
echo "OK: all migrations applied to $DB"
