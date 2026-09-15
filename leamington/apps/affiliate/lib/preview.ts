/**
 * Vista previa: what Hoy would show a prospect today, for the seller to show
 * across the counter. Reads app.prospect_preview (0051) inside the affiliate's
 * own RLS transaction; the only write is the anonymous counter row
 * (affiliate_previews: affiliate, country, time). Nothing about the prospect is
 * stored: the town and team live only in this page's query string.
 */
import type { Queryable } from "@leamington/shared/src/server/db.ts";
import { isCountry, type Country } from "./clients.ts";
import { registerFormUrl, NO_TEAM } from "./register.ts";
import type { Lang } from "./strings.ts";

export const SEARCH_MIN = 2;
const SEARCH_MAX = 60;

const one = (v: unknown): string => (typeof v === "string" ? v : Array.isArray(v) && typeof v[0] === "string" ? v[0] : "");

export type PreviewQuery = {
  country: Country | null;
  q: string;
  /** municipality id */
  m: string | null;
  /** a team id, NO_TEAM, or "" when not chosen */
  team: string;
  /** true when the team form re-submits a preview already counted */
  again: boolean;
};

export function readPreviewQuery(source: unknown): PreviewQuery {
  const s = (source ?? {}) as Record<string, unknown>;
  const country = one(s.country).trim().toUpperCase();
  const m = one(s.m).trim();
  const team = one(s.team).trim();
  return {
    country: isCountry(country) ? country : null,
    q: one(s.q).replace(/\s+/g, " ").trim().slice(0, SEARCH_MAX),
    m: /^\d{1,18}$/.test(m) ? m : null,
    team: team === NO_TEAM || /^\d{1,18}$/.test(team) ? team : "",
    again: one(s.more) === "1",
  };
}

/** Hoy's language for a person from this country: English for Jamaica, Spanish otherwise. */
export const prospectLang = (c: Country): Lang => (c === "JM" ? "en" : "es");

export type Town = { id: string; name: string; adminRegion: string; country: Country };

export async function searchTowns(q: Queryable, country: Country, text: string): Promise<Town[]> {
  const { rows } = await q.query<{ id: string; name: string; admin_region: string }>(
    "select id::text, name, admin_region from app.search_municipalities($1::country_code, null, $2, 12)", [country, text]);
  return rows.map((r) => ({ id: r.id, name: r.name, adminRegion: r.admin_region, country }));
}

export async function townById(q: Queryable, id: string): Promise<Town | null> {
  const { rows } = await q.query<{ id: string; name: string; admin_region: string; country: string }>(
    "select id::text, name, admin_region, country::text from municipalities where id = $1::bigint", [id]);
  const r = rows[0];
  return r && isCountry(r.country) ? { id: r.id, name: r.name, adminRegion: r.admin_region, country: r.country } : null;
}

// The shape of app.prospect_preview. Every part is null (or [] for news) when absent.
export type Fixture = { kickoff: string; home: string; away: string; home_id: number; away_id: number;
  home_score?: number; away_score?: number; home_crest?: boolean; away_crest?: boolean; league: string };
export type NewsItem = { id: number; title: string; source: string; published_at: string; image: boolean; thumb_w?: number; thumb_h?: number };
export type Preview = {
  language: Lang;
  municipality: { id: number; name: string; admin_region: string; country: Country; timezone: string };
  team: { id: number; name: string; crest: boolean } | null;
  photo: { municipality_id: number; author: string; license: string; license_url: string | null; source_page_url: string; width: number | null; height: number | null } | null;
  now: { temp: string; label?: string; observed_at: string; valid_until: string; providers: number } | null;
  today: { date: string; text: string; providers: number } | null;
  time: { local: string; date: string; timezone: string; offset_minutes: number };
  fx: { currency: string; rate: number; date: string; note: string } | null;
  video: { id: number; title: string; channel: string; published_at: string; thumb: boolean; thumb_w: number | null; thumb_h: number | null; scope: "team" | "league"; league: string | null } | null;
  result: Fixture | null;
  holiday: { date: string; name: string; days_left: number; verified_at: string } | null;
  news: NewsItem[];
  alerts_active: boolean;
};

/** The preview, and (when `record`) one anonymous count of it, in the caller's transaction. */
export async function loadPreview(q: Queryable, town: Town, teamId: string | null, record: boolean): Promise<Preview | null> {
  const { rows } = await q.query<{ p: Preview | null }>(
    "select app.prospect_preview($1::bigint, $2::bigint, $3) as p", [town.id, teamId, prospectLang(town.country)]);
  const p = rows[0]?.p ?? null;
  // The town (its country follows in the database); nothing about the person.
  if (p && record) await q.query("insert into affiliate_previews (municipality_id) values ($1::bigint)", [town.id]);
  return p;
}

/** For matching a typed name to a town's: no accents, lower case, single spaces. */
export const foldName = (s: string): string =>
  s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();

/** The town to preview straight from a search: the only match, or the only exact name among several. */
export function directHit(hits: readonly Town[], q: string): Town | null {
  if (hits.length === 1) return hits[0]!;
  const exact = hits.filter((h) => foldName(h.name) === foldName(q));
  return exact.length === 1 ? exact[0]! : null;
}

/** "Registrar a esta persona": the register form with country, department or parish, and team chosen. */
export const previewRegisterHref = (town: Town, team: string): string =>
  registerFormUrl({ country: town.country, name: "", region: town.adminRegion, team }, null);

/** This page with its choices, for links and the team form. */
export function previewHref(p: { country?: string | null; q?: string; m?: string | null; team?: string }): string {
  const s = new URLSearchParams();
  if (p.country) s.set("country", p.country);
  if (p.q) s.set("q", p.q);
  if (p.m) s.set("m", p.m);
  if (p.team) s.set("team", p.team);
  const qs = s.toString();
  return qs ? `/vista-previa?${qs}` : "/vista-previa";
}

/** "2 h 30 min" from minutes, without the sign. */
export function hoursMinutes(minutes: number): string {
  const a = Math.abs(minutes);
  const h = Math.floor(a / 60);
  const m = a % 60;
  return h && m ? `${h} h ${m} min` : h ? `${h} h` : `${m} min`;
}

/** HH:MM, 24 hours, in a time zone. */
export const clock = (iso: string, timeZone: string): string =>
  new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone }).format(new Date(iso));

/** 13.10, the way Hoy shows a reference rate. */
export const rateText = (rate: number): string => Number(rate).toFixed(2);
