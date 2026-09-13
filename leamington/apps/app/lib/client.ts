/**
 * The signed-in client for a section page.
 *
 * The id comes only from the signed cookie; every query is scoped by it. An
 * inactive or unknown client is signed out.
 */
import type { GetServerSidePropsContext } from "next";
import { db } from "./db";
import { readSession, cookieValue, clearedCookie } from "./session";

export type Client = {
  id: string;
  language: "es" | "en";
  country: "MX" | "GT" | "HN" | "JM";
  timezone: string;
  hasKids: boolean;
  municipality: string | null;
  firstName: string;
};

type Redirect = { redirect: { destination: string; permanent: false } };

export async function loadClient(ctx: GetServerSidePropsContext): Promise<{ client: Client } | Redirect> {
  ctx.res.setHeader("Cache-Control", "private, no-cache");
  const id = readSession(cookieValue(ctx.req.headers.cookie));
  if (!id) return { redirect: { destination: "/login", permanent: false } };
  const { rows } = await db().query(
    `select id, language, country, timezone, has_kids, municipality, split_part(full_name, ' ', 1) as first_name
       from clients where id = $1 and active`, [id]);
  const r = rows[0];
  if (!r) {
    ctx.res.setHeader("Set-Cookie", clearedCookie);
    return { redirect: { destination: "/login?e=inactive", permanent: false } };
  }
  (ctx.req as { appLang?: string }).appLang = r.language;
  return {
    client: {
      id: r.id, language: r.language, country: r.country, timezone: r.timezone, hasKids: r.has_kids,
      municipality: r.municipality, firstName: r.first_name,
    },
  };
}

/**
 * Record that a section was served, with what it showed and what it left out
 * and why. Never blocks or breaks the page.
 */
export async function recordView(clientId: string, page: string, states: Record<string, unknown>): Promise<void> {
  try {
    await db().query("select app.record_page_view($1, $2, $3::jsonb)", [clientId, page, JSON.stringify(states)]);
  } catch {
    // Instrumentation must never cost the person their page.
  }
}
