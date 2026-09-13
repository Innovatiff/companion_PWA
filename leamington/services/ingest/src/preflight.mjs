/**
 * Startup preflight.
 *
 * Separates the three things that all previously looked like "the container is
 * broken", and says which one it is:
 *
 *   misconfigured  — no DATABASE_URL. Fatal; retrying cannot help.
 *   unreachable    — configured but the database did not answer. Transient;
 *                    worth retrying rather than crash-looping.
 *   unmigrated     — connected, but the schema is not there. Actionable.
 *
 * A crash loop hides all three behind the same stack trace repeated forever.
 */
import { query, resolveDbConfig, describeDbError, DbConfigError } from "./db.mjs";
import { logger } from "./log.mjs";

const log = logger("preflight");

// Tables the scheduler touches on startup. If these are missing, migrations
// have not been applied to this database.
const REQUIRED_TABLES = ["alert_sources", "lottery_games", "source_runs", "feed_expectations"];

export async function preflight() {
  try {
    resolveDbConfig();
  } catch (err) {
    if (err instanceof DbConfigError) return { ok: false, state: "misconfigured", fatal: true, detail: err.message };
    throw err;
  }

  try {
    await query("select 1");
  } catch (err) {
    return { ok: false, state: "unreachable", fatal: false, detail: describeDbError(err) };
  }

  const { rows } = await query(
    `select table_name from information_schema.tables
      where table_schema = 'public' and table_name = any($1::text[])`,
    [REQUIRED_TABLES]);
  const present = new Set(rows.map((r) => r.table_name));
  const missing = REQUIRED_TABLES.filter((t) => !present.has(t));

  if (missing.length) {
    return {
      ok: false, state: "unmigrated", fatal: false,
      detail:
        `Connected, but the schema is missing: ${missing.join(", ")}.\n` +
        `  Apply the migrations against this database:\n` +
        `      cd leamington/packages/db && ./test/run-migrations.sh\n` +
        `  then load the seeds (alert_sources, municipalities_jm, lottery_games,\n` +
        `  feed_expectations) from packages/db/seeds/.`,
    };
  }

  const { rows: [counts] } = await query(
    `select (select count(*) from alert_sources where active)::int as active_sources,
            (select count(*) from clients where active)::int      as active_clients,
            (select count(*) from lottery_games where active)::int as active_games`);

  log.info("ready", counts);
  if (counts.active_sources === 0)
    log.warn("no_active_alert_sources", { note: "no alerts will be ingested until a source is activated" });
  if (counts.active_clients === 0)
    log.warn("no_active_clients", { note: "alerts will be stored but matched to nobody" });

  return { ok: true, state: "ready", detail: counts };
}
