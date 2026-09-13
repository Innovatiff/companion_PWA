/**
 * The one-time setup token travels from the POST that issued it to the next
 * page in a short-lived HttpOnly cookie scoped to /affiliates. The page shows
 * it and clears the cookie, so it is shown once and never sits in a URL, a
 * browser history or a server log.
 */
import { secureCookies } from "@leamington/shared/src/server/session.ts";
import { encodeFlash } from "./rules.ts";

export const FLASH_COOKIE = "lo_setup";

export const flashCookie = (affiliateId: string, token: string): string =>
  `${FLASH_COOKIE}=${encodeFlash(affiliateId, token)}; Path=/affiliates; Max-Age=600; HttpOnly; SameSite=Strict${secureCookies() ? "; Secure" : ""}`;

export const clearedFlash = (): string =>
  `${FLASH_COOKIE}=; Path=/affiliates; Max-Age=0; HttpOnly; SameSite=Strict${secureCookies() ? "; Secure" : ""}`;
