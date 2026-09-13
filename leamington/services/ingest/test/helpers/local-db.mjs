/**
 * A throwaway local Postgres for integration tests.
 *
 * The database is built with packages/db/test/run-migrations.sh -- which refuses
 * any non-local host -- plus the seeds, so tests exercise the real schema rather
 * than a mock of it. Defaults to the socket the db test suite uses; override
 * with TEST_PGHOST / TEST_PGPORT / TEST_PGUSER.
 */
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DB_DIR = fileURLToPath(new URL("../../../../packages/db/", import.meta.url));

const LOCAL = {
  PGHOST: process.env.TEST_PGHOST ?? "/tmp",
  PGPORT: process.env.TEST_PGPORT ?? "55432",
  PGUSER: process.env.TEST_PGUSER ?? "postgres",
};

function localEnv() {
  const env = { ...process.env, ...LOCAL };
  delete env.DATABASE_URL;   // a real connection string must never reach a test
  return env;
}

/** null when a local server answers; otherwise why these tests cannot run. */
export function localDbUnavailable() {
  try {
    execFileSync("psql", ["-X", "-tAc", "select 1", "postgres"], { env: localEnv(), stdio: "pipe" });
    return null;
  } catch (err) {
    const reason = String(err.stderr || err.message).trim().split("\n")[0];
    return `no local Postgres at ${LOCAL.PGHOST}:${LOCAL.PGPORT} (${reason})`;
  }
}

/** Rebuild `name` from migrations and seeds, and point src/db.mjs at it. */
export function useFreshDatabase(name) {
  const env = localEnv();
  execFileSync(path.join(DB_DIR, "test/run-migrations.sh"), [name], { env, stdio: "pipe" });
  const seeds = readdirSync(path.join(DB_DIR, "seeds")).filter((f) => f.endsWith(".sql")).sort();
  for (const f of seeds) {
    execFileSync("psql", ["-X", "-v", "ON_ERROR_STOP=1", "-q", "-f", path.join(DB_DIR, "seeds", f), name],
      { env, stdio: "pipe" });
  }
  delete process.env.DATABASE_URL;
  Object.assign(process.env, LOCAL, { PGDATABASE: name });
}

/**
 * Replace global fetch with fixed responses. A route that is an Error is thrown;
 * a URL with no route throws too, so an unexpected request fails loudly. Every
 * requested URL is recorded.
 */
export function stubFetch(routes) {
  const requested = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => {
    requested.push(String(url));
    const route = routes[String(url)];
    if (route instanceof Error) throw route;
    if (route === undefined) throw new Error(`unexpected fetch in test: ${url}`);
    return typeof route === "string"
      ? new Response(route, { status: 200 })
      : new Response(route.body ?? "", { status: route.status ?? 200 });
  };
  return { requested, restore: () => { globalThis.fetch = original; } };
}
