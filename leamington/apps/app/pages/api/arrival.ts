/**
 * POST /api/arrival: "Llegué a Canadá el…" for a seasonal member
 * (app.set_arrival_date, 0041). An empty date clears it. Returns to Más with
 * either ?ok=arrival or the reason it was not saved:
 *   arrival-date   not a real calendar date
 *   arrival-range  more than 400 days from today, or after their going-home date
 * Same origin and session checks as the setup and text-size forms.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { sameOrigin, field } from "@leamington/shared/src/server/portal.ts";
import { db } from "../../lib/db";
import { readSession, cookieValue, clearedCookie } from "../../lib/session";

export default async function arrival(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end();
  }
  if (!sameOrigin(req)) return res.status(403).end();
  const clientId = readSession(cookieValue(req.headers.cookie));
  if (!clientId) return res.redirect(303, "/login");

  const signOut = () => {
    res.setHeader("Set-Cookie", clearedCookie);
    return res.redirect(303, "/login?e=inactive");
  };
  const back = (qs: string) => res.redirect(303, `/mas?${qs}#llegada`);

  const q = db();
  const { rows } = await q.query("select segment::text as segment from clients where id = $1 and active", [clientId]);
  if (!rows[0]) return signOut();
  // Only a seasonal member has a season to arrive for.
  if (rows[0].segment !== "seasonal") return res.status(400).end();

  const date = field(req.body, "date").trim();
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return back("e=arrival-date");

  try {
    await q.query("select app.set_arrival_date($1, $2::date)", [clientId, date || null]);
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "23514") return back("e=arrival-range");
    if (code === "22007" || code === "22008") return back("e=arrival-date");
    if (code === "42501") return signOut();
    throw err;
  }
  return back("ok=arrival");
}
