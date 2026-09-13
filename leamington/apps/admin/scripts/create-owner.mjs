// Create an owner login and print its one-time setup link (valid 72 hours).
//
//   DATABASE_URL=... ADMIN_URL=https://admin.example node scripts/create-owner.mjs <login> [es|en]
//
// Uses app.portal_create_owner (0018). The link is the only copy of the token:
// the database stores a hash. DATABASE_URL is never printed.
import pg from "pg";

const [login, language = "es"] = process.argv.slice(2);
if (!login || !/^[a-z0-9._-]{3,40}$/.test(login.trim().toLowerCase()) || !["es", "en"].includes(language)) {
  console.error("usage: node scripts/create-owner.mjs <login> [es|en]");
  console.error("  login: 3 to 40 characters, lowercase letters, digits, dot, underscore, hyphen");
  process.exit(2);
}
const url = process.env.DATABASE_URL?.trim();
if (!url) { console.error("DATABASE_URL is not set"); process.exit(2); }

// Same rule as packages/shared/src/server/db.ts: no TLS for a local or socket database.
function isLocal(u) {
  if (/[?&]host=(%2F|\/|localhost\b|127\.0\.0\.1\b)/i.test(u) || /^postgres(ql)?:\/\/([^@/]*@)?\//i.test(u)) return true;
  try {
    const host = decodeURIComponent(new URL(u).hostname);
    return ["localhost", "127.0.0.1", "::1", ""].includes(host) || host.startsWith("/");
  } catch {
    return false;
  }
}

const client = new pg.Client({
  connectionString: url,
  ssl: isLocal(url) || /[?&]sslmode=/i.test(url)
    ? undefined
    : { rejectUnauthorized: process.env.PG_SSL_REJECT_UNAUTHORIZED !== "false" },
});

try {
  await client.connect();
  const { rows } = await client.query("select app.portal_create_owner($1, $2::ui_language) as r", [login, language]);
  const token = rows[0].r.setup_token;
  const base = (process.env.ADMIN_URL?.trim() || "http://localhost:3300").replace(/\/+$/, "");
  console.log(`Owner "${login.trim().toLowerCase()}" created.`);
  console.log("One-time setup link (works once, expires in 72 hours):");
  console.log(`${base}/setup?token=${encodeURIComponent(token)}`);
} catch (err) {
  if (err?.code === "23505") console.error(`A portal login named "${login}" already exists.`);
  else console.error(`Could not create the owner: ${err?.message ?? err}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
