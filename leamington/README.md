# Leamington

Companion PWA for seasonal agricultural and warehouse workers in Windsor-Essex,
Ontario, plus the affiliate and owner portals behind it.

Start with **[CLAUDE.md](./CLAUDE.md)** — product rules, architecture and the
non-negotiables — then **[docs/SOURCE-VERIFICATION.md](./docs/SOURCE-VERIFICATION.md)**
for what the data sources actually turned out to be.

## Layout

```
apps/app/         PWA, client-facing          (not started — gated on verification)
apps/affiliate/   affiliate portal            (not started)
apps/admin/       owner portal                (not started)
packages/db/      schema + migrations         <- built and tested
packages/shared/  types, auth, code generation
services/ingest/  scheduled jobs              <- verification harness built
```

## Database

```bash
# needs postgres + postgis on PATH
export PGHOST=/tmp PGPORT=5432 PGUSER=postgres
packages/db/test/run-migrations.sh    # apply 0001..0005 to a throwaway db
packages/db/test/run-tests.sh         # assert the rules actually hold
```

The tests assert behaviour, not just that the DDL parses — polygon matching
excludes a client in a dry corner of the same department, yellow alerts do not
push, a second notification on the same local day is rejected, and one
affiliate cannot read another's clients.

## Verifying sources

```bash
node services/ingest/verify/run.mjs
```
