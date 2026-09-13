/**
 * The wrapper every feed runs inside.
 *
 * Its whole job is to make SILENCE IS NEVER EVIDENCE true at the data layer:
 * a run that succeeded with zero records and a run that never answered are
 * recorded as different facts, so nothing downstream can read one as the other.
 *
 *   status 'ok'      — the source answered. records_written may legitimately be 0.
 *   status 'partial' — the source answered, but some items failed to process.
 *   status 'error'   — we did not get an answer. This is NOT "zero results".
 *
 * source_result records what the source itself said, for feeds that report it:
 *
 *   'items'           — it listed items (new, or already stored)
 *   'confirmed_empty' — it answered that nothing is active
 *   'no_answer'       — we could not get an answer
 */

import { query } from "./db.mjs";
import { logger } from "./log.mjs";

export async function runFeed(feed, fn) {
  const log = logger(feed);
  const startedAt = new Date();

  const { rows } = await query(
    `insert into source_runs (feed, started_at, status) values ($1, $2, 'ok') returning id`,
    [feed, startedAt],
  );
  const runId = rows[0].id;

  log.info("run.start", { runId });

  const ctx = { log, runId, feed, warnings: [] };
  try {
    const result = (await fn(ctx)) ?? {};
    const written = result.recordsWritten ?? 0;
    const status = ctx.warnings.length > 0 ? "partial" : "ok";
    const sourceResult = result.sourceResult ?? null;

    await query(
      `update source_runs
          set finished_at = now(), status = $2, records_written = $3,
              http_status = $4, notes = $5, source_result = $6::source_result
        where id = $1`,
      [runId, status, written, result.httpStatus ?? null,
       ctx.warnings.length ? JSON.stringify({ warnings: ctx.warnings }) : null,
       sourceResult],
    );

    log.info("run.finish", {
      runId, status, recordsWritten: written,
      ms: Date.now() - startedAt.getTime(),
      // Stated explicitly so "0 records" is never ambiguous in the log stream.
      sourceAnswered: true,
      sourceResult: sourceResult ?? undefined,
      warnings: ctx.warnings.length || undefined,
    });
    return { status, recordsWritten: written, sourceResult };
  } catch (err) {
    const message = describeError(err);
    await query(
      `update source_runs
          set finished_at = now(), status = 'error', error = $2, http_status = $3,
              source_result = 'no_answer'
        where id = $1`,
      [runId, message, err?.httpStatus ?? null],
    );
    log.error("run.error", {
      runId, error: message,
      ms: Date.now() - startedAt.getTime(),
      // The load-bearing distinction.
      sourceAnswered: false,
      inconclusive: true,
    });
    return { status: "error", error: message, sourceResult: "no_answer" };
  }
}

export function describeError(err) {
  const code = err?.cause?.code || err?.code;
  const msg = String(err?.cause?.message || err?.message || err);
  if (err?.name === "AbortError") return "timeout";
  if (code === "ENOTFOUND") return "DNS lookup failed";
  if (code === "ECONNREFUSED") return "connection refused";
  if (code === "ECONNRESET") return "connection reset mid-transfer";
  if (/403|proxy/i.test(msg)) return "blocked by proxy (egress policy)";
  if (code) return `${code}: ${msg}`;
  return msg;
}

/** fetch with a timeout that throws rather than hanging a scheduled job. */
export async function fetchText(url, { headers = {}, timeoutMs = 25_000 } = {}) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "user-agent": "leamington-ingest/0.1", ...headers },
      redirect: "follow",
      signal: ac.signal,
    });
    const body = await res.text();
    if (!res.ok) {
      const e = new Error(`HTTP ${res.status}`);
      e.httpStatus = res.status;
      throw e;
    }
    return { body, status: res.status };
  } finally {
    clearTimeout(timer);
  }
}
