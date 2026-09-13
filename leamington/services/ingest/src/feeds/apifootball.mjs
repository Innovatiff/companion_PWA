/**
 * API-Football access for ingest.
 *
 * Free plan (docs/OPEN-DECISIONS.md #2): 100 requests/day, 10/minute, and date
 * queries reach only yesterday to tomorrow. We hold ourselves to a lower daily
 * ceiling shared with verify/football.mjs.
 *
 * API-Football reports plan, key and quota problems as HTTP 200 with an
 * `errors` object and an empty response. HTTP 200 alone is never an answer.
 */
import { fetchText } from "../run-feed.mjs";

const BASE = "https://v3.football.api-sports.io";

export const DAILY_CEILING = Number(process.env.API_FOOTBALL_DAILY_CEILING || 50);

export class ApiFootballError extends Error {
  constructor(message, kind) {
    super(message);
    this.name = "ApiFootballError";
    this.kind = kind;
    this.inconclusive = true;   // the provider did not answer the question
  }
}

export async function apiFootball(path, { key = process.env.API_FOOTBALL_KEY } = {}) {
  if (!key) throw new ApiFootballError("API_FOOTBALL_KEY is not set", "config");
  const { body } = await fetchText(BASE + path, { headers: { "x-apisports-key": key } });

  let json;
  try { json = JSON.parse(body); } catch { throw new ApiFootballError("API-Football returned non-JSON", "provider"); }

  const e = json.errors;
  const errors = Array.isArray(e) ? (e.length ? { ...e } : null) : (e && Object.keys(e).length ? e : null);
  if (errors) {
    const keys = Object.keys(errors);
    const kind = keys.includes("plan") ? "plan-gated"
      : keys.some((k) => /token|key/i.test(k)) ? "key rejected"
      : keys.some((k) => /rate|requests/i.test(k)) ? "rate limited"
      : "provider error";
    throw new ApiFootballError(`${kind}: ${Object.values(errors).join("; ")}`, kind);
  }
  return json;
}

/**
 * Requests API-Football has counted today. The /status endpoint does not
 * itself count against the quota (checked 2026-09-13: two calls, count unchanged).
 */
export async function requestsUsedToday(opts) {
  const json = await apiFootball("/status", opts);
  const current = json.response?.requests?.current;
  return Number.isFinite(current) ? current : null;
}
