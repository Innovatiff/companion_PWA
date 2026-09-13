#!/usr/bin/env bash
# Rebuild a throwaway database, apply seeds, then assert the rules hold.
# Self-contained: the tests are not idempotent, so the database is rebuilt each
# run rather than assumed clean.
set -euo pipefail
DB="${1:-leamington_test}"
HERE="$(cd "$(dirname "$0")" && pwd)"

"$HERE/run-migrations.sh" "$DB" >/dev/null

for seed in "$HERE"/../seeds/*.sql; do
  [ -e "$seed" ] || continue
  psql -v ON_ERROR_STOP=1 -q -f "$seed" "$DB"
done

fail=0
# Every numbered test file, in order. (A 0[1-9] pattern silently skipped 10 and up.)
for f in "$HERE"/[0-9][0-9]_*.sql; do
  echo "-- $(basename "$f")"
  if ! psql -v ON_ERROR_STOP=1 -q -f "$f" "$DB" 2>&1 \
       | sed 's/^psql:[^ ]* NOTICE:  //' | grep -vE '^-+$'; then
    fail=1
  fi
done
exit $fail
