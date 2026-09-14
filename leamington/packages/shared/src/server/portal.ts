/**
 * Sign-in and sessions for the two portals: affiliate and owner.
 *
 * Accounts live in portal_logins (0018): bcrypt passwords set through a
 * one-time setup link, throttled sign-in, and `sessions_valid_after`, so a
 * password reset or a deactivation ends every session already issued.
 *
 * The cookie is a signed token bound to its portal (the HMAC purpose is the
 * role), so an affiliate cookie is worthless on the admin portal. A valid
 * signature is never enough on its own: every request re-checks the account with
 * app.portal_session.
 *
 * Pages read data with `asPerson(person.authUserId, ...)`, so row-level security
 * decides what an affiliate sees.
 */
import type { IncomingMessage } from "node:http";
import { db } from "./db.ts";
import { sourceHash } from "./source.ts";
import { makeToken, readToken, cookieHeader, clearedCookieHeader, cookieValue, secureCookies } from "./session.ts";

export type PortalRole = "affiliate" | "owner";

export type PortalPerson = {
  authUserId: string;
  login: string;
  role: PortalRole;
  affiliateId: string | null;
  affiliateName: string | null;
  language: "es" | "en";
  isTest: boolean;
};

const COOKIE: Record<PortalRole, string> = { affiliate: "la", owner: "lo" };

/** Money portals: a working day, then sign in again. */
const MAX_AGE_SECONDS = 12 * 60 * 60;

export const portalCookieName = (role: PortalRole): string => COOKIE[role];

/** The signed-in person for this portal, re-checked against the database; otherwise null. */
export async function currentPerson(req: IncomingMessage, role: PortalRole): Promise<PortalPerson | null> {
  const token = readToken(role, cookieValue(req.headers.cookie, COOKIE[role]));
  if (!token) return null;
  const { rows } = await db().query("select app.portal_session($1::uuid, $2::timestamptz) as s",
    [token.subject, token.issuedAt.toISOString()]);
  const s = rows[0]?.s;
  if (!s || s.role !== role) return null;
  return {
    authUserId: s.auth_user_id, login: s.login, role: s.role,
    affiliateId: s.affiliate_id ?? null, affiliateName: s.affiliate_name ?? null,
    language: s.language === "en" ? "en" : "es", isTest: Boolean(s.is_test),
  };
}

/** For getServerSideProps: the person, or a redirect to the sign-in page. */
export async function requirePerson(req: IncomingMessage, role: PortalRole):
  Promise<{ person: PortalPerson; redirect?: undefined } | { person?: undefined; redirect: { destination: string; permanent: false } }> {
  const person = await currentPerson(req, role);
  return person ? { person } : { redirect: { destination: "/login", permanent: false } };
}

export type SignInStatus = "ok" | "invalid" | "inactive" | "throttled" | "setup_required";

/**
 * Check a login and password. On success returns the Set-Cookie header value.
 * An account of the other role is refused as `invalid`, so the portals do not
 * reveal which logins exist on the other one.
 */
export async function signIn(req: IncomingMessage, role: PortalRole, login: string, password: string):
  Promise<{ status: SignInStatus; cookie?: string }> {
  const { rows } = await db().query("select app.portal_sign_in($1, $2, $3) as r",
    [login, password, sourceHash(req, role)]);
  const r = rows[0]?.r as { status: SignInStatus; auth_user_id?: string; role?: string } | undefined;
  if (!r) return { status: "invalid" };
  if (r.status !== "ok") return { status: r.status };
  if (r.role !== role || !r.auth_user_id) return { status: "invalid" };
  return { status: "ok", cookie: cookieHeader(COOKIE[role], makeToken(role, r.auth_user_id), MAX_AGE_SECONDS, secureCookies()) };
}

export type SetupStatus = "ok" | "weak_password" | "invalid_token" | "expired";

/** Set the password with a one-time setup token. The person then signs in. */
export async function completeSetup(token: string, password: string): Promise<{ status: SetupStatus; login?: string; role?: PortalRole }> {
  const { rows } = await db().query("select app.portal_complete_setup($1, $2) as r", [token, password]);
  return rows[0]?.r ?? { status: "invalid_token" };
}

export const signOutCookie = (role: PortalRole): string => clearedCookieHeader(COOKIE[role]);

/**
 * Sign out on the server as well as in the browser: every session issued for
 * this login until now stops working (0028). Returns the Set-Cookie value.
 */
export async function signOut(req: IncomingMessage, role: PortalRole): Promise<string> {
  const person = await currentPerson(req, role);
  if (person) await db().query("select app.portal_sign_out($1)", [person.authUserId]);
  return signOutCookie(role);
}

/**
 * Forms post only from our own pages. SameSite=Lax already withholds the cookie
 * from a cross-site POST; this refuses one that names another origin anyway.
 */
export function sameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  const fetchSite = req.headers["sec-fetch-site"];
  // A browser that says the request is cross-site is refused whatever else it sends.
  if (fetchSite === "cross-site" || fetchSite === "same-site") return false;
  if (!origin) return true;
  // Under a strict referrer policy browsers send "Origin: null" even from our own
  // page; Sec-Fetch-Site then tells us where the form was.
  if (origin === "null") return fetchSite === "same-origin";
  const host = (req.headers["x-forwarded-host"] as string | undefined)?.split(",")[0].trim() || req.headers.host;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** A single string field from a parsed form body; anything else is "". */
export function field(body: unknown, name: string): string {
  const v = (body as Record<string, unknown> | null | undefined)?.[name];
  return typeof v === "string" ? v : "";
}
