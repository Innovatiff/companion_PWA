#!/usr/bin/env node
/**
 * Does the Jamaica Premier League have a published fixture calendar?
 *
 * This gates the Jamaican home screen's football anchor, and with it apps/app
 * (docs/OPEN-DECISIONS.md #2). API-Football's free plan cannot answer it (date
 * queries reach only yesterday to tomorrow), so this sweeps TheSportsDB's free
 * per-day query across the next N days, one request per day.
 *
 * Verdicts:
 *   PUBLISHED      at least one Jamaica Premier League match is listed more than
 *                  --min-ahead days out
 *   NOT_PUBLISHED  every day answered, and none lists such a match. This is
 *                  "not published", not "no season".
 *   INCONCLUSIVE   no match found, and at least one day did not answer
 *
 * Exit code 0 only for PUBLISHED, so the scheduled workflow keeps failing,
 * visibly, until the calendar exists.
 *
 *   node verify/jpl-calendar.mjs [--days 56] [--min-ahead 3]
 */
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const JPL_THESPORTSDB_ID = "5075";

/**
 * days: [{ date: "YYYY-MM-DD", answered: boolean, reason?: string, events: [{ idLeague, dateEvent, strEvent }] }]
 * Events from any other league are ignored.
 */
export function calendarVerdict(days, { today, minAheadDays = 3, leagueId = JPL_THESPORTSDB_ID }) {
  const cutoff = new Date(Date.parse(`${today}T00:00:00Z`) + minAheadDays * 86_400_000).toISOString().slice(0, 10);
  const matches = days.flatMap((d) => (d.answered ? d.events : [])
    .filter((e) => String(e?.idLeague) === leagueId)
    .map((e) => ({ date: e.dateEvent ?? d.date, event: e.strEvent })));
  const ahead = matches.filter((m) => m.date >= cutoff);
  const unanswered = days.filter((d) => !d.answered);

  const verdict = ahead.length ? "PUBLISHED" : unanswered.length ? "INCONCLUSIVE" : "NOT_PUBLISHED";
  const weeks = {};
  for (const m of matches) {
    const w = Math.floor((Date.parse(`${m.date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / (7 * 86_400_000)) + 1;
    weeks[w] = (weeks[w] ?? 0) + 1;
  }
  return {
    verdict, cutoff, daysChecked: days.length, daysUnanswered: unanswered.length,
    matchesListed: matches.length, matchesAhead: ahead.length,
    matchDates: [...new Set(matches.map((m) => m.date))].sort(),
    matchesPerWeek: weeks, lastMatchListed: matches.map((m) => m.date).sort().at(-1) ?? null,
    unansweredDays: unanswered.map((d) => `${d.date}: ${d.reason}`),
  };
}

async function sweep({ days, today, key, fetchImpl = globalThis.fetch, pauseMs = 2_200 }) {
  const out = [];
  for (let i = 0; i < days; i++) {
    const date = new Date(Date.parse(`${today}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10);
    let entry = { date, answered: false, reason: "not attempted", events: [] };
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetchImpl(`https://www.thesportsdb.com/api/v1/json/${key}/eventsday.php?d=${date}&l=${JPL_THESPORTSDB_ID}`,
          { signal: AbortSignal.timeout(20_000) });
        const text = await res.text();
        if (res.status === 429) { entry.reason = "rate limited (HTTP 429)"; await new Promise((r) => setTimeout(r, 15_000)); continue; }
        if (res.status !== 200) { entry.reason = `HTTP ${res.status}`; break; }
        if (text.trim() === "") { entry = { date, answered: true, events: [] }; break; }
        let json;
        try { json = JSON.parse(text); } catch { entry.reason = "response was not JSON"; break; }
        entry = { date, answered: true, events: Array.isArray(json.events) ? json.events : [] };
        break;
      } catch (err) {
        entry.reason = `unreachable: ${err?.cause?.code || err?.name || err?.message}`;
      }
    }
    out.push(entry);
    await new Promise((r) => setTimeout(r, pauseMs));
  }
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const arg = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? Number(args[i + 1]) : dflt; };
  const days = arg("--days", 56);
  const minAheadDays = arg("--min-ahead", 3);
  const today = new Date().toISOString().slice(0, 10);

  const swept = await sweep({ days, today, key: process.env.THESPORTSDB_KEY || "3" });
  const result = calendarVerdict(swept, { today, minAheadDays });

  const lines = [
    `## Jamaica Premier League calendar: ${result.verdict}`,
    "",
    `- Checked ${result.daysChecked} days from ${today} (TheSportsDB, one query per day); ${result.daysUnanswered} did not answer`,
    `- Matches listed: ${result.matchesListed}; more than ${minAheadDays} days ahead (on or after ${result.cutoff}): ${result.matchesAhead}`,
    `- Match dates: ${result.matchDates.join(", ") || "none"}`,
    `- Matches per week (week 1 starts ${today}): ${JSON.stringify(result.matchesPerWeek)}`,
    result.verdict === "NOT_PUBLISHED"
      ? "- Every day answered and no match is listed that far ahead. This means NOT PUBLISHED, not \"no season\"."
      : result.verdict === "INCONCLUSIVE"
        ? `- Some days did not answer: ${result.unansweredDays.join("; ")}`
        : "- A fixture calendar is published beyond the next few days.",
  ];
  console.log(lines.join("\n"));
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join("\n") + "\n");
  process.exit(result.verdict === "PUBLISHED" ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
