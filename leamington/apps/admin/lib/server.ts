/**
 * Guards shared by every owner page and API route.
 *
 * Pages: `ownerPage(ctx)` returns the signed-in owner or a redirect to /login,
 * and sets the <html lang> for _document.
 * API routes: `ownerApi(req, res)` refuses anything but a same-origin POST from
 * a signed-in owner. Business data and every money or account write then goes
 * through `asPerson(person.authUserId, ...)`, where the database checks
 * app.require_owner() itself.
 */
import type { GetServerSidePropsContext, NextApiRequest, NextApiResponse } from "next";
import { requirePerson, currentPerson, sameOrigin, type PortalPerson } from "@leamington/shared/src/server/portal.ts";
import { qs } from "./rules.ts";

export type Viewer = { lang: "es" | "en"; login: string };

type Redirect = { redirect: { destination: string; permanent: false } };

export async function ownerPage(ctx: GetServerSidePropsContext): Promise<{ person: PortalPerson; viewer: Viewer } | Redirect> {
  ctx.res.setHeader("Cache-Control", "private, no-store");
  const r = await requirePerson(ctx.req, "owner");
  if (!r.person) return { redirect: r.redirect };
  (ctx.req as { adminLang?: string }).adminLang = r.person.language;
  return { person: r.person, viewer: { lang: r.person.language, login: r.person.login } };
}

export async function ownerApi(req: NextApiRequest, res: NextApiResponse): Promise<PortalPerson | null> {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).end();
    return null;
  }
  if (!sameOrigin(req)) {
    res.status(403).end();
    return null;
  }
  const person = await currentPerson(req, "owner");
  if (!person) {
    res.redirect(303, "/login");
    return null;
  }
  return person;
}

/** 303 back to a page, with a query string. */
export const go = (res: NextApiResponse, path: string, params: Record<string, string | number | null | undefined> = {}) =>
  res.redirect(303, path + qs(params));

/** The Postgres SQLSTATE of an error, if it has one. */
export const pgCode = (err: unknown): string | undefined => (err as { code?: string } | null)?.code;

/** Rows as plain JSON for page props: timestamps become ISO strings. */
export const plain = <T>(v: T): T => JSON.parse(JSON.stringify(v));
