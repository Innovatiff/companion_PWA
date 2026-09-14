/**
 * Pure helpers for collecting a renewal in person (0029, 0031). No database, no Next.
 *
 * Any business can renew any Hoy client by the code on their receipt, and the
 * business that collects a renewal earns its commission (0031). The client
 * stays in the list of the business that registered them.
 *
 *   /renew                 type the code from the client's receipt
 *   POST /api/renew/lookup app.renewal_lookup -> /renew/<client id>
 *   /renew/<client id>     app.renewal_status: who, until when, your commission
 *   POST /api/renew/record app.affiliate_record_renewal -> /renew/done/<request key>
 *   /renew/done/<key>      app.renewal_receipt
 */
import { isValidCode, normalizeCode } from "@leamington/shared/src/code.ts";
import { formatMoney } from "@leamington/shared/src/format.ts";
import { isUuid } from "./clients.ts";
import type { Strings } from "./strings.ts";

/** Why /renew or /renew/<id> was sent back, as ?e=. */
export type RenewError = "invalid" | "not_found" | "throttled" | "inactive";
const RENEW_ERRORS: readonly RenewError[] = ["invalid", "not_found", "throttled", "inactive"];
export const isRenewError = (v: unknown): v is RenewError =>
  typeof v === "string" && (RENEW_ERRORS as readonly string[]).includes(v);

/** What was typed, normalised (dashes, spaces, lower case, O→Q and the like), or null if it cannot be a code. */
export function lookupCode(typed: string): string | null {
  const raw = typed.slice(0, 40);
  return isValidCode(raw) ? normalizeCode(raw) : null;
}

/** Where app.renewal_lookup's answer sends the affiliate. The code never goes in a URL. */
export function lookupRedirect(r: { status?: unknown; client_id?: unknown } | null | undefined): string {
  if (r?.status === "found" && isUuid(r.client_id)) return `/renew/${r.client_id}`;
  if (r?.status === "not_found") return "/renew?e=not_found";
  if (r?.status === "throttled") return "/renew?e=throttled";
  throw new Error(`app.renewal_lookup returned an unexpected answer: ${JSON.stringify(r)}`);
}

/** Where app.affiliate_record_renewal's answer sends the affiliate. */
export function recordRedirect(r: { status?: unknown; request_key?: unknown } | null | undefined, clientId: string): string {
  switch (r?.status) {
    case "renewed":
    case "duplicate": // the same form again: the same renewal, shown again
      if (isUuid(r.request_key)) return `/renew/done/${r.request_key}`;
      break;
    case "recent_renewal":
      return `/renew/${clientId}?recent=1`;
    case "client_inactive":
      return `/renew/${clientId}?e=inactive`;
  }
  throw new Error(`app.affiliate_record_renewal returned an unexpected answer: ${JSON.stringify(r)}`);
}

/** The status chip on the renewal page, in words. */
export function renewStatusLabel(status: string, daysLeft: number | null, t: Strings): string {
  switch (status) {
    case "active": return t.statusActive;
    case "due": return t.expiresIn(daysLeft ?? 0);
    case "lapsed": return t.statusLapsed;
    default: return t.renewNoPeriod;
  }
}

/** How the new period is placed: from today (lapsed, or never paid) or from the current end (early). */
export function periodPlacement(status: string): "lapsed" | "none" | "extends" {
  return status === "lapsed" ? "lapsed" : status === "none" ? "none" : "extends";
}

/** The business that registered the client: information only, it does not decide who earns a renewal. */
export type Registrant = { name: string; is_you: boolean; is_house: boolean };

export function registeredByLabel(a: Registrant, t: Strings): string {
  return a.is_you ? t.registeredByYou : a.is_house ? t.registeredByHouse : t.registeredBy(a.name);
}

/** The registrant alone, for a "Registrado por" row: "ti", "Hoy (registro directo)" or the business name. */
export function registrantName(a: Registrant, t: Strings): string {
  const label = registeredByLabel(a, t);
  return a.is_you || a.is_house ? label.slice(label.indexOf(": ") + 2) : a.name;
}

/** "Tu comisión: $8.00", or "Sin comisión" when this business earns nothing on it. */
export function commissionLabel(commission: number | string | null | undefined, t: Strings): string {
  const n = Number(commission ?? 0);
  return n > 0 ? t.yourCommission(formatMoney(n)) : t.noCommission;
}

/** price × rate, to the cent, as app.insert_renewal rounds it. */
export function commissionOf(price: number | string, rate: number | string): string {
  const cents = Math.round(Number(price) * Number(rate) * 100 + Number.EPSILON);
  return (cents / 100).toFixed(2);
}

/** The client's language for the printed slip, as clients.language is set: English for Jamaica. */
export const slipLang = (country: string): "es" | "en" => (country === "JM" ? "en" : "es");

/** app.require_active_affiliate refused: the affiliate was deactivated after signing in. */
export const refusedAffiliate = (err: unknown): boolean => (err as { code?: unknown } | null)?.code === "42501";

/** A form checkbox that was ticked. */
export const ticked = (v: unknown): boolean => v === "1" || v === "on";
