/**
 * Static / slow records: national holidays, national school calendars,
 * consulate details.
 *
 * `verified_at` is displayed to users as "Verificado: 3 de marzo". For that to
 * mean anything, it must record when a PERSON checked the record against the
 * source -- not when a script happened to run. So this loader reads curated
 * files and REFUSES any record without an explicit verified_at and verifier.
 *
 * Curated files live in services/ingest/data/*.json.
 */
import { readFile, readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { query } from "../db.mjs";

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "data");

function requireVerification(record, file, index) {
  const where = `${file}[${index}]`;
  if (!record.verified_at) throw new Error(`${where}: missing verified_at — a human must confirm this record`);
  if (!record.verified_by) throw new Error(`${where}: missing verified_by — who checked it?`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(record.verified_at)) throw new Error(`${where}: verified_at must be YYYY-MM-DD`);
  if (record.needs_verification === true) throw new Error(`${where}: flagged needs_verification — refusing to publish unconfirmed data`);
}

const WRITERS = {
  holidays: async (r) => query(
    `insert into holidays (country, holiday_date, name, verified_at, source_url)
     values ($1::country_code,$2,$3,$4,$5)
     on conflict (country, holiday_date, name) do update
       set verified_at = excluded.verified_at, source_url = excluded.source_url`,
    [r.country, r.holiday_date, r.name, r.verified_at, r.source_url ?? null]),

  school_calendar: async (r) => query(
    `insert into school_calendar (country, school_year, event_name, start_date, end_date, verified_at, source_url)
     values ($1::country_code,$2,$3,$4,$5,$6,$7)
     on conflict (country, school_year, event_name, start_date) do update
       set end_date = excluded.end_date, verified_at = excluded.verified_at`,
    [r.country, r.school_year, r.event_name, r.start_date, r.end_date ?? null, r.verified_at, r.source_url ?? null]),

  consulates: async (r) => query(
    `insert into consulates (country, city, address, hours, phone, email, booking_url, services, verified_at, source_url)
     values ($1::country_code,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     on conflict (country, city) do update
       set address = excluded.address, hours = excluded.hours, phone = excluded.phone,
           email = excluded.email, booking_url = excluded.booking_url,
           services = excluded.services, verified_at = excluded.verified_at`,
    [r.country, r.city, r.address ?? null, r.hours ?? null, r.phone ?? null, r.email ?? null,
     r.booking_url ?? null, r.services ? JSON.stringify(r.services) : null, r.verified_at, r.source_url ?? null]),
};

export async function ingestStatic(ctx) {
  const { log } = ctx;
  let files = [];
  try { files = (await readdir(DATA_DIR)).filter((f) => f.endsWith(".json")); }
  catch {
    ctx.warnings.push(`no curated data directory at ${DATA_DIR}`);
    log.warn("no_data_dir", { dir: DATA_DIR });
    return { recordsWritten: 0 };
  }

  if (!files.length) {
    // A successful run with nothing to load is NOT health. Without this the
    // admin dashboard shows "static: ok" while holidays, school calendars and
    // consulate records are entirely absent -- silence reading as fine.
    ctx.warnings.push("no curated static records exist yet (holidays, school calendars, consulates)");
    log.warn("no_curated_files", {
      dir: DATA_DIR,
      note: "no static records curated yet; this is not a claim that none exist",
    });
    return { recordsWritten: 0 };
  }

  let written = 0;
  for (const file of files) {
    const kind = file.replace(/\.json$/, "").replace(/^[a-z]{2}[-_]/i, "");
    const writer = WRITERS[kind];
    if (!writer) { ctx.warnings.push(`${file}: unknown record kind "${kind}"`); continue; }

    const records = JSON.parse(await readFile(join(DATA_DIR, file), "utf8"));
    for (const [i, r] of records.entries()) {
      requireVerification(r, file, i);      // throws: unverified data never lands
      await writer(r);
      written++;
    }
    log.info("file.loaded", { file, kind, records: records.length });
  }
  return { recordsWritten: written };
}
