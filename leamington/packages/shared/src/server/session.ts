/**
 * Signed session cookies for all three apps.
 *
 * A token is `subject.issuedAt.signature`, where the HMAC covers a purpose
 * string as well as the payload. A client cookie therefore cannot be replayed
 * as an affiliate or owner cookie, even though all three apps share
 * SESSION_SECRET.
 *
 * The server re-checks every session against the database on each request (an
 * active client, an active portal login, no password reset since issuedAt), so
 * a valid signature alone never grants access.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export type Purpose = "client" | "affiliate" | "owner";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set to at least 32 characters.");
  return s;
}

const sign = (purpose: Purpose, payload: string): string =>
  createHmac("sha256", secret()).update(`${purpose}\n${payload}`).digest("base64url");

export function makeToken(purpose: Purpose, subject: string, nowMs: number = Date.now()): string {
  if (!UUID.test(subject)) throw new Error("not an id");
  const payload = `${subject}.${Math.floor(nowMs / 1000)}`;
  return `${payload}.${sign(purpose, payload)}`;
}

export type Signed = { subject: string; issuedAt: Date };

/** The subject and issue time if the token is ours, for this purpose, and unaltered. */
export function readToken(purpose: Purpose, value: string | undefined): Signed | null {
  if (!value) return null;
  const cut = value.lastIndexOf(".");
  if (cut <= 0) return null;
  const payload = value.slice(0, cut);
  const given = Buffer.from(value.slice(cut + 1));
  const expected = Buffer.from(sign(purpose, payload));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const [subject, issued] = payload.split(".");
  const seconds = Number(issued);
  if (!UUID.test(subject ?? "") || !Number.isFinite(seconds)) return null;
  return { subject, issuedAt: new Date(seconds * 1000) };
}

export function cookieHeader(name: string, value: string, maxAgeSeconds: number, secure: boolean): string {
  return `${name}=${value}; Path=/; Max-Age=${maxAgeSeconds}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}

export const clearedCookieHeader = (name: string): string => `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`;

export function cookieValue(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(/;\s*/)) {
    const eq = part.indexOf("=");
    if (eq > 0 && part.slice(0, eq) === name) return part.slice(eq + 1);
  }
  return undefined;
}

export const secureCookies = (): boolean => process.env.COOKIE_SECURE !== "false";
