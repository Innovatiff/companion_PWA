/**
 * Our Postgres, server side only, shared by all three apps.
 *
 * The browser never talks to the database or to any external API; it gets HTML
 * rendered from here.
 *
 * Two ways to query:
 *
 * - `db()` uses the connection's own role, which bypasses row-level security.
 *   It is for Hoy, where every query is scoped by the client id resolved from
 *   the signed cookie (0005_rls.sql), and for account functions.
 * - `asPerson(authUserId, fn)` runs `fn` in a transaction as the role
 *   `authenticated`, with that person as the JWT subject. The RLS policies then
 *   decide what an affiliate can read, so the portals do not rely on page code
 *   to filter.
 */
import pg from "pg";

let pool: pg.Pool | null = null;

function isLocal(url: string): boolean {
  // A Unix socket URL ("postgresql://user@/db?host=/tmp") is not a valid WHATWG
  // URL, so it must be recognised before parsing.
  if (/[?&]host=(%2F|\/|localhost\b|127\.0\.0\.1\b)/i.test(url) || /^postgres(ql)?:\/\/([^@/]*@)?\//i.test(url)) return true;
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
  if (!url) throw new Error("DATABASE_URL is not set. The apps read only from our Postgres.");
  pool = new pg.Pool({
    connectionString: url,
    max: Number(process.env.PG_POOL_MAX || 4),
    idleTimeoutMillis: 30_000,
    ssl: isLocal(url) || /[?&]sslmode=/i.test(url)
      ? undefined
      : { rejectUnauthorized: process.env.PG_SSL_REJECT_UNAUTHORIZED !== "false" },
  });
  return pool;
}

export type Queryable = Pick<pg.PoolClient, "query">;

/** Run `fn` as the signed-in portal user, with row-level security enforced by the database. */
export async function asPerson<T>(authUserId: string, fn: (q: Queryable) => Promise<T>): Promise<T> {
  const client = await db().connect();
  try {
    await client.query("begin");
    await client.query("set local role authenticated");
    await client.query(
      `select set_config('request.jwt.claim.sub', $1, true),
              set_config('request.jwt.claim.role', 'authenticated', true),
              set_config('request.jwt.claims', $2, true)`,
      [authUserId, JSON.stringify({ sub: authUserId, role: "authenticated" })]);
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
