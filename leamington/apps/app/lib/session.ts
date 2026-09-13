/**
 * The session: a signed cookie holding the client id.
 *
 * The code IS the account. Entering it sets this cookie; entering it again on a
 * new phone sets it again, and everything comes back because nothing lives on
 * the phone but a cache. The server re-checks that the client is active on
 * every render, so deactivating a client ends the session.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const COOKIE = "lc";
const MAX_AGE_SECONDS = 400 * 24 * 60 * 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set to at least 32 characters.");
  return s;
}

const sign = (payload: string): string => createHmac("sha256", secret()).update(payload).digest("base64url");

export function makeSession(clientId: string, nowMs: number = Date.now()): string {
  if (!UUID.test(clientId)) throw new Error("not a client id");
  const payload = `${clientId}.${Math.floor(nowMs / 1000)}`;
  return `${payload}.${sign(payload)}`;
}

/** The client id if the cookie is ours and unaltered; otherwise null. */
export function readSession(value: string | undefined): string | null {
  if (!value) return null;
  const cut = value.lastIndexOf(".");
  if (cut <= 0) return null;
  const payload = value.slice(0, cut);
  const given = Buffer.from(value.slice(cut + 1));
  const expected = Buffer.from(sign(payload));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const clientId = payload.split(".")[0];
  return UUID.test(clientId) ? clientId : null;
}

export function sessionCookie(value: string, secure: boolean): string {
  return `${COOKIE}=${value}; Path=/; Max-Age=${MAX_AGE_SECONDS}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}

export const clearedCookie = `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`;

export function cookieValue(header: string | undefined, name: string = COOKIE): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(/;\s*/)) {
    const eq = part.indexOf("=");
    if (eq > 0 && part.slice(0, eq) === name) return part.slice(eq + 1);
  }
  return undefined;
}

export const secureCookies = (): boolean => process.env.COOKIE_SECURE !== "false";
