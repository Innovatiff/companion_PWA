# apps/affiliate — the affiliate portal

Four screens for an affiliate at a counter with a line waiting: register a
client (4 fields), the issued code, my clients, my earnings, and renewing any
client in person by the code on their receipt (the business that collects a
renewal earns its commission; the client stays in the registering business's
list). Plus sign-in and the one-time password setup link.

| Route | What |
| --- | --- |
| `/login`, `POST /api/login` | login name + password (0018) |
| `/setup?token=…`, `POST /api/setup` | set the password from the owner's one-time link |
| `/` | my clients: renewals due first, then everyone (`client_status`) |
| `/register`, `/register?country=MX`, `POST /api/register` | step 1 country, step 2 the form; `app.register_client` |
| `/clients/[id]/code` | the code, printable; 404 for anyone else's client |
| `/renew`, `POST /api/renew/lookup` | type the code from the client's receipt; `app.renewal_lookup` (any client, throttled) |
| `/renew/[clientId]`, `POST /api/renew/record` | status, who earns, the period bought; `app.affiliate_record_renewal` with a per-render request key |
| `/renew/done/[key]` | `app.renewal_receipt`, printable; 404 unless you collected it |
| `/earnings` | registrations and renewals apart (`affiliate_earnings`), renewals you collected (`app.my_renewal_collections`), payouts |
| `POST /api/logout` | sign out |
| `/health` | `healthHandler("affiliate")` |

## How it is built

- Pages Router, `unstable_runtimeJS: false` on every page: server-rendered HTML,
  inline CSS (`PORTAL_CSS`), no framework JS. The only script is the inline
  `onclick="print()"` on the code page.
- Forms POST to `/api/*` and redirect with 303. Choices that depend on an
  earlier choice are GET steps.
- Every business read and write runs inside `asPerson(person.authUserId, …)`, so
  row-level security decides what an affiliate sees.
- Spanish by default; English when the portal login's language is `en`
  (`lib/strings.ts`).

## Run locally

```bash
export PATH=/opt/homebrew/opt/postgresql@17/bin:$PATH PGHOST=/tmp PGPORT=55433 PGUSER=postgres
packages/db/test/run-migrations.sh leamington_affiliate
for s in packages/db/seeds/*.sql; do psql -v ON_ERROR_STOP=1 -q -f "$s" leamington_affiliate; done
# run-migrations.sh does not record what it applied; /health reads schema_migrations (as migrate.sh keeps it)
psql -q -c "create table if not exists schema_migrations (filename text primary key, applied_at timestamptz not null default now())" leamington_affiliate
for f in packages/db/migrations/*.sql; do psql -q -c "insert into schema_migrations (filename) values ('$(basename "$f")') on conflict do nothing" leamington_affiliate; done
psql -At -F ' ' -f apps/affiliate/scripts/local-accounts.sql leamington_affiliate   # prints "<login> <setup token>"

cd apps/affiliate
export DATABASE_URL='postgresql://postgres@/leamington_affiliate?host=/tmp&port=55433' \
       SESSION_SECRET=local-secret-at-least-32-characters-long COOKIE_SECURE=false
../../node_modules/.bin/next build && ../../node_modules/.bin/next start -p 3200
```

Then open `http://localhost:3200/setup?token=<token>`.

## Checks

```bash
node --test test/*.test.mjs
../../node_modules/.bin/tsc --noEmit -p .
LOGIN_A=ana SETUP_TOKEN_A=… LOGIN_B=beto SETUP_TOKEN_B=… node scripts/smoke.mjs   # local only: records sales
LOGIN=ana PASSWORD=… node scripts/measure.mjs                                     # local only: records a sale
```
