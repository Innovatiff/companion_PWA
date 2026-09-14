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
import { db } from "@leamington/shared/src/server/db.ts";
import { requirePerson, currentPerson, sameOrigin, type PortalPerson } from "@leamington/shared/src/server/portal.ts";
import { qs } from "./rules.ts";

/** Sidebar counts. null = could not be read, and then no badge is shown. */
export type Badges = { due: number | null; feedsBad: number | null };
export type Viewer = { lang: "es" | "en"; login: string; badges: Badges };

type Redirect = { redirect: { destination: string; permanent: false } };

/**
 * One small query for the sidebar badges: real clients due for renewal today,
 * and expected feeds whose health is anything but ok (stale, error, or could not
 * determine). Read with the server connection, only after the owner check.
 */
async function navCounts(): Promise<Badges> {
  try {
    const r = await db().query(
      `select (select count(*) from client_status where status = 'due' and not is_test)::int as due,
              (select count(*) from feed_health_detail where health is distinct from 'ok')::int as feeds_bad`);
    return { due: r.rows[0].due, feedsBad: r.rows[0].feeds_bad };
  } catch {
    return { due: null, feedsBad: null };
  }
}

export async function ownerPage(ctx: GetServerSidePropsContext): Promise<{ person: PortalPerson; viewer: Viewer } | Redirect> {
  ctx.res.setHeader("Cache-Control", "private, no-store");
  const r = await requirePerson(ctx.req, "owner");
  if (!r.person) return { redirect: r.redirect };
  (ctx.req as { adminLang?: string }).adminLang = r.person.language;
  return { person: r.person, viewer: { lang: r.person.language, login: r.person.login, badges: await navCounts() } };
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
