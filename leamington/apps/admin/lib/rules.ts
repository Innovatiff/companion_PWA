/**
 * Pure rules for the owner portal: input parsing, sorting and the feed-health
 * mapping. No database, no framework, so they are tested directly
 * (test/rules.test.mjs).
 */
export type Lang = "es" | "en";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

/** Client volume order (CLAUDE.md). */
export const COUNTRIES = ["MX", "GT", "HN", "JM"] as const;
export type Country = (typeof COUNTRIES)[number];
export const isCountry = (v: unknown): v is Country => typeof v === "string" && (COUNTRIES as readonly string[]).includes(v);

export const CLIENT_STATUSES = ["active", "due", "lapsed", "none"] as const;
export type ClientStatus = (typeof CLIENT_STATUSES)[number];
export const isClientStatus = (v: unknown): v is ClientStatus =>
  typeof v === "string" && (CLIENT_STATUSES as readonly string[]).includes(v);

/**
 * A commission typed as a percentage ("40", "40%", "37.5") to a rate string
 * for numeric(5,4) ("0.4000", "0.3750"). Null unless 0..100 with at most two
 * decimals. Integer arithmetic, so no float drift reaches the ledger.
 */
export function parsePercent(input: string): string | null {
  const s = input.trim().replace(/%$/, "").trim().replace(",", ".");
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  const bp = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  if (bp > 10000) return null;
  return `${Math.floor(bp / 10000)}.${String(bp % 10000).padStart(4, "0")}`;
}

/** "0.4000" -> "40%", "0.3750" -> "37.5%". */
export function percentLabel(rate: string | number): string {
  const bp = Math.round(Number(rate) * 10000);
  const whole = Math.floor(bp / 100);
  const frac = String(bp % 100).padStart(2, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}%` : `${whole}%`;
}

/** The percentage number for a form field: "0.4000" -> "40". */
export const percentInput = (rate: string | number): string => percentLabel(rate).replace("%", "");

/**
 * An amount of money typed by a person: "25", "25.5", "$25.50", "25,50".
 * Returns "25.50", or null for anything else, zero, or a thousands separator
 * (which cannot be told apart from a decimal comma).
 */
export function parseAmount(input: string): string | null {
  const s = input.trim().replace(/^\$\s*/, "");
  if (!/^\d{1,7}([.,]\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ""] = s.split(/[.,]/);
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  if (cents <= 0) return null;
  return centsToString(cents);
}

/** "12.34" or 12.34 -> 1234. Money is added in cents, never in floats. */
export const toCents = (v: string | number | null | undefined): number => Math.round(Number(v ?? 0) * 100);
export const centsToString = (cents: number): string =>
  `${cents < 0 ? "-" : ""}${Math.floor(Math.abs(cents) / 100)}.${String(Math.abs(cents) % 100).padStart(2, "0")}`;

/** Portal login names as the database stores them (0018), or null. */
export function normalizeLogin(input: string): string | null {
  const s = input.trim().toLowerCase();
  return /^[a-z0-9._-]{3,40}$/.test(s) ? s : null;
}

// ---------------------------------------------------------------------------
// Sales per affiliate: who is selling and who isn't
// ---------------------------------------------------------------------------

/** A timestamp from pg (Date) or from JSON (ISO string) as a sortable string; null as "". */
export const stamp = (v: string | Date | null | undefined): string =>
  v == null ? "" : v instanceof Date ? v.toISOString() : String(v);

export type SalesRow = {
  affiliate_id: string;
  name: string;
  active: boolean;
  is_test: boolean;
  is_house: boolean;
  sales_7d: number;
  sales_30d: number;
  sales_all: number;
  last_sale_at: string | Date | null;
};

/** An active, real, non-house affiliate with no sale in 30 days. */
export const isQuiet = (r: Pick<SalesRow, "active" | "is_house" | "sales_30d">): boolean =>
  r.active && !r.is_house && r.sales_30d === 0;

/**
 * Real active affiliates first, busiest first, so the ones with no sales sink
 * to the bottom of that group where their "no sales" mark is easy to see. Then
 * the owner's direct registrations, then inactive affiliates, then test ones.
 */
export function sortSales<T extends SalesRow>(rows: T[]): T[] {
  const group = (r: SalesRow) => (r.is_test ? 3 : !r.active ? 2 : r.is_house ? 1 : 0);
  return [...rows].sort((a, b) =>
    group(a) - group(b)
    || b.sales_30d - a.sales_30d
    || b.sales_7d - a.sales_7d
    || b.sales_all - a.sales_all
    || stamp(b.last_sale_at).localeCompare(stamp(a.last_sale_at))
    || a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// Renewals: who collected, who earns, who lapses
// ---------------------------------------------------------------------------

type Grouped = { active: boolean; is_test: boolean; is_house: boolean; name: string };

/** Real active affiliates first, then the owner's direct registrations, then inactive, then test ones last. */
export function sortAffiliateGroups<T extends Grouped>(rows: T[], busier: (a: T, b: T) => number = () => 0): T[] {
  const group = (r: Grouped) => (r.is_test ? 3 : !r.active ? 2 : r.is_house ? 1 : 0);
  return [...rows].sort((a, b) => group(a) - group(b) || busier(a, b) || a.name.localeCompare(b.name));
}

/**
 * Who physically took the money for a renewal: the collecting affiliate, or
 * `ownerLabel` when the owner marked it paid in admin (collected_by is null).
 */
export const collectorLabel = (r: { collected_by_owner: boolean; collecting_affiliate: string | null }, ownerLabel: string): string =>
  r.collected_by_owner ? ownerLabel : r.collecting_affiliate ?? ownerLabel;

/**
 * renewal_log.collected_by_other is also true when the owner collected (null is
 * distinct from the earner). The "another affiliate" mark is only for an affiliate.
 */
export const collectedByOtherAffiliate = (r: { collected_by_owner: boolean; collected_by_other: boolean }): boolean =>
  r.collected_by_other && !r.collected_by_owner;

/**
 * affiliate_lapse_rate.lapse_rate (0..1, 4 decimals) as "12.5%". Null when no
 * client has come due yet: that is "nobody yet", never 0%.
 */
export const lapseRateLabel = (rate: string | number | null | undefined): string | null =>
  rate === null || rate === undefined || rate === "" ? null : percentLabel(rate);

// ---------------------------------------------------------------------------
// Feed health. SILENCE IS NEVER EVIDENCE: ok, stale and error are distinct,
// and anything we cannot place is "unknown", never ok.
// ---------------------------------------------------------------------------

export type FeedState = "ok" | "stale" | "error" | "unknown";

/** feed_health_detail.health (0008/0014) to one of the displayed states. */
export function feedState(health: string | null | undefined): FeedState {
  switch (health) {
    case "ok": return "ok";
    case "stale": return "stale";
    case "failing":
    case "never_succeeded":
    case "degraded": return "error";
    default: return "unknown"; // never_run, null, or a value this page does not know
  }
}

const FEED_RANK: Record<FeedState, number> = { error: 0, stale: 1, unknown: 2, ok: 3 };

export type FeedRow = { feed: string; health: string | null; last_ok_at: string | Date | null };

/** Most severe first; alert feeds before others at the same severity; then the longest silence. */
export function sortFeeds<T extends FeedRow>(rows: T[]): T[] {
  return [...rows].sort((a, b) =>
    FEED_RANK[feedState(a.health)] - FEED_RANK[feedState(b.health)]
    || Number(b.feed.startsWith("alerts:")) - Number(a.feed.startsWith("alerts:"))
    || stamp(a.last_ok_at).localeCompare(stamp(b.last_ok_at))
    || a.feed.localeCompare(b.feed));
}

// ---------------------------------------------------------------------------
// Revenue
// ---------------------------------------------------------------------------

export type RevenueMonth = { month: string; sales: number; renewals: number; gross: string; affiliate_commissions: string; net: string };
export type PayoutMonth = { month: string; paid_out: string };
export type RevenueLine = { month: string; sales: number; renewals: number; gross: number; commissions: number; net: number; paidOut: number };

/** Month rows (in cents) newest first, including months with payouts but no sales, and the all-time totals. */
export function mergeRevenue(revenue: RevenueMonth[], payouts: PayoutMonth[]): { lines: RevenueLine[]; totals: Omit<RevenueLine, "month"> } {
  const byMonth = new Map<string, RevenueLine>();
  const line = (month: string) => {
    let l = byMonth.get(month);
    if (!l) byMonth.set(month, (l = { month, sales: 0, renewals: 0, gross: 0, commissions: 0, net: 0, paidOut: 0 }));
    return l;
  };
  for (const r of revenue) {
    const l = line(r.month);
    l.sales += Number(r.sales); l.renewals += Number(r.renewals);
    l.gross += toCents(r.gross); l.commissions += toCents(r.affiliate_commissions);
    l.net = l.gross - l.commissions;
  }
  for (const p of payouts) line(p.month).paidOut += toCents(p.paid_out);
  const lines = [...byMonth.values()].sort((a, b) => b.month.localeCompare(a.month));
  const totals = { sales: 0, renewals: 0, gross: 0, commissions: 0, net: 0, paidOut: 0 };
  for (const l of lines) {
    totals.sales += l.sales; totals.renewals += l.renewals; totals.gross += l.gross;
    totals.commissions += l.commissions; totals.paidOut += l.paidOut;
  }
  totals.net = totals.gross - totals.commissions;
  return { lines, totals };
}

const MONTHS: Record<Lang, string[]> = {
  es: ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
};

/** "2026-09" -> "septiembre 2026" / "September 2026". */
export function monthLabel(ym: string, lang: Lang): string {
  const [y, m] = ym.split("-").map(Number);
  const name = MONTHS[lang][(m ?? 1) - 1] ?? ym;
  return `${name} ${y}`;
}

// ---------------------------------------------------------------------------
// Small helpers for forms and redirects
// ---------------------------------------------------------------------------

/** "?a=1&b=x" from the non-empty values, or "". */
export function qs(params: Record<string, string | number | null | undefined>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined && v !== "") u.set(k, String(v));
  const s = u.toString();
  return s ? `?${s}` : "";
}

/** Where a renewal form may send the owner back to. Anything else goes to the pipeline. */
export function safeBack(path: string): string {
  if (path === "/renewals") return path;
  const m = /^\/clients\/([0-9a-f-]{36})$/i.exec(path);
  return m && isUuid(m[1]) ? path : "/renewals";
}

/** The one-time setup link a person opens to set their password. */
export const setupLink = (base: string, token: string): string =>
  `${base.replace(/\/+$/, "")}/setup?token=${encodeURIComponent(token)}`;

const TOKEN = /^[0-9a-f]{48}$/;

/**
 * The setup token rides from the POST to the next page in a short-lived HttpOnly
 * cookie bound to the affiliate, so it is shown once and never sits in a URL.
 */
export const encodeFlash = (affiliateId: string, token: string): string => `${affiliateId}.${token}`;
export function readFlash(value: string | undefined, affiliateId: string): string | null {
  if (!value) return null;
  const cut = value.indexOf(".");
  const id = value.slice(0, cut), token = value.slice(cut + 1);
  return cut > 0 && id === affiliateId && TOKEN.test(token) ? token : null;
}

/** A feed interval in seconds, as "15 min", "6 h", "1 día" / "7 days". */
export function durationLabel(seconds: number, lang: Lang): string {
  const s = Math.max(0, Math.round(seconds));
  if (s >= 86400 && s % 86400 === 0) {
    const d = s / 86400;
    return lang === "en" ? `${d} day${d === 1 ? "" : "s"}` : `${d} día${d === 1 ? "" : "s"}`;
  }
  if (s >= 3600 && s % 3600 === 0) return `${s / 3600} h`;
  if (s >= 60) return `${Math.round(s / 60)} min`;
  return `${s} s`;
}

/** A LIKE pattern matching `text` anywhere, with the wildcards in it escaped. */
export const containsPattern = (text: string): string => `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/** First value of a query parameter, as a string. */
export const q1 = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] ?? "" : v ?? "");
