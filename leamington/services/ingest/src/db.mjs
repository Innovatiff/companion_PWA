/** Postgres access. Ingest is the only writer to feed tables. */
import pg from "pg";

// Keep numerics as strings -> JS numbers where it is safe to do so. Money and
// FX rates stay strings elsewhere; here we only relax float8/int.
pg.types.setTypeParser(pg.types.builtins.FLOAT8, (v) => (v === null ? null : Number(v)));
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => (v === null ? null : Number(v)));

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  host: process.env.PGHOST,
  port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
  user: process.env.PGUSER,
  database: process.env.PGDATABASE || "leamington",
  max: Number(process.env.PG_POOL_MAX || 4),
  idleTimeoutMillis: 30_000,
});

export const query = (text, params) => pool.query(text, params);

export async function withTransaction(fn) {
  const client = await pool.connect();
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

export const closePool = () => pool.end();
