# apps/admin

The owner portal. Next.js Pages Router, client runtime JS disabled on every
page, inline CSS, plain HTML forms posting to `pages/api/*` (docs/DESIGN.md).

```
npm run build && npm start                 # port 3300
node scripts/create-owner.mjs <login> [es|en]   # prints a one-time setup link (ADMIN_URL)
npm test                                   # pure rules (node:test)
BASE=... DATABASE_URL=... SESSION_SECRET=... node scripts/smoke.mjs    # end to end, local/staging only
BASE=... LOGIN=... PASSWORD=... node scripts/measure.mjs               # bytes on the wire
```

Environment: `DATABASE_URL`, `SESSION_SECRET` (32+ characters, shared with the
other apps), `COOKIE_SECURE` (unset in production), `ADMIN_URL`, `AFFILIATE_URL`
(base of the affiliate setup links). See `.env.example`.

`scripts/local-demo.sql` loads contrasting demo data into a throwaway local
database; never run it anywhere else.
