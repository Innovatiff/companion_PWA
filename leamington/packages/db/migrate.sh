#!/usr/bin/env bash
#
# Apply migrations to an EXISTING database (Supabase, Railway, any managed PG).
#
# This is NOT test/run-migrations.sh. That script is local-only: it DROPS and
# recreates a throwaway database and installs stub auth.uid()/auth.role()
# functions. Run it against Supabase and it would overwrite the real auth
# helpers that every RLS policy in the project depends on.
#
#   ./migrate.sh "$DATABASE_URL"          # apply pending migrations
#   ./migrate.sh "$DATABASE_URL" --dry-run # list what would be applied
#
# Safe to re-run: every migration is recorded in schema_migrations and applied
# at most once. Each runs inside its own transaction, so a failure leaves that
# migration fully rolled back rather than half applied, and the run stops there.
set -euo pipefail

URL="${1:-${DATABASE_URL:-}}"
DRY=""
[ "${2:-}" = "--dry-run" ] && DRY=1
[ "${1:-}" = "--dry-run" ] && { DRY=1; URL="${DATABASE_URL:-}"; }

if [ -z "$URL" ]; then
  echo "usage: ./migrate.sh <DATABASE_URL> [--dry-run]" >&2
  exit 2
fi

HERE="$(cd "$(dirname "$0")" && pwd)"
PSQL=(psql -v ON_ERROR_STOP=1 -X -q "$URL")

# The stub guard protects REAL instances. A local database legitimately carries
# the stubs (that is how the test suite runs), so the check is scoped to
# non-local hosts.
host=$(printf '%s' "$URL" | sed -E 's|^[a-z+]+://([^@]*@)?([^:/?]+).*|\2|')
case "$host" in
  localhost|127.0.0.1|::1|"") LOCAL=1 ;;
  *) LOCAL="" ;;
esac

stub=""
[ -z "$LOCAL" ] && stub=$("${PSQL[@]}" -tAc "
  select coalesce(bool_or(pg_get_functiondef(p.oid) like '%request.jwt.claim.sub%'), false)
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='auth' and p.proname='uid';" 2>/dev/null || echo "unknown")
if [ "$stub" = "t" ]; then
  echo "REFUSING: auth.uid() on this database looks like the LOCAL STUB, not Supabase's." >&2
  echo "  test/run-migrations.sh appears to have been run against it. Restore the real" >&2
  echo "  Supabase auth functions before continuing." >&2
  exit 1
fi

"${PSQL[@]}" -c "
  create table if not exists schema_migrations (
    filename    text primary key,
    applied_at  timestamptz not null default now()
  );" >/dev/null

applied=0 skipped=0
for f in "$HERE"/migrations/*.sql; do
  name="$(basename "$f")"
  done_already=$("${PSQL[@]}" -tAc "select 1 from schema_migrations where filename='$name'")
  if [ "$done_already" = "1" ]; then
    echo "  skip    $name (already applied)"
    skipped=$((skipped+1))
    continue
  fi
  if [ -n "$DRY" ]; then
    echo "  PENDING $name"
    continue
  fi

  echo "  apply   $name"
  # One transaction per migration: a failure rolls that file back entirely.
  if ! "${PSQL[@]}" --single-transaction \
        -c "insert into schema_migrations (filename) values ('$name')" \
        -f "$f"; then
    echo "" >&2
    echo "FAILED on $name — stopped. Nothing from this file was applied." >&2
    echo "  Fix the cause, then re-run; already-applied migrations are skipped." >&2
    exit 1
  fi
  applied=$((applied+1))
done

[ -n "$DRY" ] && { echo "(dry run — nothing applied)"; exit 0; }
echo "OK: $applied applied, $skipped already present"
