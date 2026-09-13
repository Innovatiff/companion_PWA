/**
 * Hoy's session: a signed cookie holding the client id (purpose "client").
 *
 * The code IS the account. Entering it sets this cookie; entering it again on a
 * new phone sets it again, and everything comes back because nothing lives on
 * the phone but a cache. The server re-checks that the client is active on
 * every render, so deactivating a client ends the session.
 */
import {
  makeToken, readToken, cookieHeader, clearedCookieHeader, cookieValue as readCookie, secureCookies,
} from "@leamington/shared/src/server/session.ts";

export const COOKIE = "lc";
const MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

export const makeSession = (clientId: string, nowMs: number = Date.now()): string => makeToken("client", clientId, nowMs);

/** The client id if the cookie is ours and unaltered; otherwise null. */
export const readSession = (value: string | undefined): string | null => readToken("client", value)?.subject ?? null;

export const sessionCookie = (value: string, secure: boolean): string => cookieHeader(COOKIE, value, MAX_AGE_SECONDS, secure);

export const clearedCookie = clearedCookieHeader(COOKIE);

export const cookieValue = (header: string | undefined, name: string = COOKIE): string | undefined => readCookie(header, name);

export { secureCookies };
