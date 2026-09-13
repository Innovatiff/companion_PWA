/**
 * Postgres access. Ingest is the only writer to feed tables.
 *
 * Configuration is resolved explicitly and fails LOUDLY when absent. `pg`
 * defaults to localhost:5432 when given nothing, so a missing DATABASE_URL used
 * to surface as `ECONNREFUSED 127.0.0.1:5432` -- the container refusing a
 * connection to itself -- and the operator had to infer "env var not set" from
 * a network error. Configuration problems say so in words.
 */
import pg from "pg";

pg.types.setTypeParser(pg.types.builtins.FLOAT8, (v) => (v === null ? null : Number(v)));
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => (v === null ? null : Number(v)));

export class DbConfigError extends Error {
  constructor(message) { super(message); this.name = "DbConfigError"; this.fatal = true; }
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", ""]);

function hostOf(connectionString) {
  try { return new URL(connectionString).hostname; } catch { return null; }
}

/**
 * Build the pool config, or throw a DbConfigError explaining exactly what to set.
 * Never silently falls back to localhost.
 */
export function resolveDbConfig(env = process.env) {
  const url = env.DATABASE_URL?.trim();

  if (url) {
    const cfg = { connectionString: url };
    const host = hostOf(url);
    // Managed Postgres (Supabase, Railway, RDS) requires TLS. If the URL does
    // not already say so, enable it rather than failing with a bare
    // "no encryption" error the operator has to decode.
    if (host && !LOCAL_HOSTS.has(host) && !/[?&]sslmode=/i.test(url)) {
      cfg.ssl = { rejectUnauthorized: env.PG_SSL_REJECT_UNAUTHORIZED !== "false" };
    }
    return cfg;
  }

  if (env.PGHOST) {
    return {
      host: env.PGHOST,
      port: env.PGPORT ? Number(env.PGPORT) : 5432,
      user: env.PGUSER,
      password: env.PGPASSWORD,
      database: env.PGDATABASE || "leamington",
    };
  }

  throw new DbConfigError(
    "No database configuration found.\n" +
    "\n" +
    "  Set DATABASE_URL to the Postgres connection string, e.g.\n" +
    "      postgresql://USER:PASSWORD@HOST:5432/postgres\n" +
    "\n" +
    "  On Railway: service -> Variables -> New Variable -> DATABASE_URL.\n" +
    "  On Supabase: Project Settings -> Database -> Connection string (URI).\n" +
    "\n" +
    "  (PGHOST/PGUSER/PGDATABASE are also accepted for local development.)\n" +
    "\n" +
    "  Refusing to start. Without this the process would try localhost:5432 and\n" +
    "  report a connection error that looks like a network fault.",
  );
}

let _pool = null;

export function getPool() {
  if (_pool) return _pool;
  const cfg = resolveDbConfig();
  _pool = new pg.Pool({ ...cfg, max: Number(process.env.PG_POOL_MAX || 4), idleTimeoutMillis: 30_000 });
  // A pool-level error must not take the process down; the scheduler and health
  // endpoint stay up and report the problem.
  _pool.on("error", (err) => {
    process.stderr.write(JSON.stringify({
      ts: new Date().toISOString(), level: "error", feed: "db",
      msg: "pool.error", error: err?.message, code: err?.code,
    }) + "\n");
  });
  return _pool;
}

export const query = (text, params) => getPool().query(text, params);

export async function withTransaction(fn) {
  const client = await getPool().connect();
  try {
    await client.query("begin");
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

export const closePool = async () => { if (_pool) { await _pool.end(); _pool = null; } };

/** Describe a connection failure in terms an operator can act on. */
export function describeDbError(err) {
  const code = err?.code || err?.errors?.[0]?.code;
  const host = err?.errors?.[0]?.address ?? err?.address;
  if (err instanceof DbConfigError) return err.message;
  if (code === "ECONNREFUSED")
    return `Database refused the connection at ${host ?? "the configured host"}:${err?.errors?.[0]?.port ?? err?.port ?? 5432}.\n` +
           `  Check DATABASE_URL points at the database, not at this container.`;
  if (code === "ENOTFOUND")  return `Database host not found. Check the hostname in DATABASE_URL.`;
  if (code === "ETIMEDOUT")  return `Timed out connecting. Check the database allows connections from this network.`;
  if (code === "28P01")      return `Password authentication failed. Check the credentials in DATABASE_URL.`;
  if (code === "3D000")      return `That database does not exist. Check the database name in DATABASE_URL.`;
  if (/self.signed|unable to verify|CERT_/i.test(String(err?.message)))
    return `TLS verification failed. If the provider uses a private CA, set PG_SSL_REJECT_UNAUTHORIZED=false.`;
  return `${code ? code + ": " : ""}${err?.message ?? String(err)}`;
}
