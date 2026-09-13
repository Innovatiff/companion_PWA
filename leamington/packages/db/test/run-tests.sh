#!/usr/bin/env bash
# Behavioural tests for the rules encoded in the schema.
# Assumes run-migrations.sh has already built the database.
set -euo pipefail
DB="${1:-leamington_test}"
HERE="$(cd "$(dirname "$0")" && pwd)"
for f in "$HERE"/0[12]_*.sql; do
  echo "-- $(basename "$f")"
  psql -v ON_ERROR_STOP=1 -q -f "$f" "$DB" 2>&1 \
    | sed 's/^psql:[^ ]* NOTICE:  //' \
    | grep -vE '^-+$'
done
