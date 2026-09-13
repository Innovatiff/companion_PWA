/**
 * Our Postgres, server side only. The browser never talks to the database or to
 * any external API; it gets HTML rendered from here.
 *
 * Queries run with the connection's own role, which bypasses RLS. Every query
 * is therefore scoped by the client id resolved from the signed session cookie,
 * never by an id sent from the browser (see packages/db/migrations/0005_rls.sql).
 */
import pg from "pg";

let pool: pg.Pool | null = null;

function isLocal(url: string): boolean {
  try {
    const host = decodeURIComponent(new URL(url).hostname);
    return ["localhost", "127.0.0.1", "::1", ""].includes(host) || host.startsWith("/");
  } catch {
    return false;
  }
}

export function db(): pg.Pool {
  if (pool) return pool;
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL is not set. The app reads only from our Postgres.");
  pool = new pg.Pool({
    connectionString: url,
    max: 3,
    idleTimeoutMillis: 30_000,
    ssl: isLocal(url) || /[?&]sslmode=/i.test(url)
      ? undefined
      : { rejectUnauthorized: process.env.PG_SSL_REJECT_UNAUTHORIZED !== "false" },
  });
  return pool;
}
