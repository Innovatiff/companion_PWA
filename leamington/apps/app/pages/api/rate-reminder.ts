/**
 * POST /api/rate-reminder: "Avísame cuando suba" (0042).
 *   action=set    target=<number>  app.set_rate_reminder (replaces the open one)
 *   action=clear                   app.clear_rate_reminder
 * Returns to Tasa's #avisame with ?ok=reminder|cleared or the reason it was not
 * saved: reminder-number (not a number), reminder-range (the database refuses a
 * target at or below zero or more than 25% from the latest reference rate),
 * reminder-norate (there is no reference rate yet). Same origin and session
 * checks as the other member forms.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { sameOrigin, field } from "@leamington/shared/src/server/portal.ts";
import { db } from "../../lib/db";
import { readSession, cookieValue, clearedCookie } from "../../lib/session";

export default async function rateReminder(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end();
  }
  if (!sameOrigin(req)) return res.status(403).end();
  const clientId = readSession(cookieValue(req.headers.cookie));
  if (!clientId) return res.redirect(303, "/login");

  const action = field(req.body, "action");
  if (action !== "set" && action !== "clear") return res.status(400).end();
  const r = ["7", "90"].includes(field(req.body, "r")) ? `r=${field(req.body, "r")}&` : "";
  const back = (qs: string) => res.redirect(303, `/mas/tasa?${r}${qs}#avisame`);
  const signOut = () => {
    res.setHeader("Set-Cookie", clearedCookie);
    return res.redirect(303, "/login?e=inactive");
  };

  try {
    if (action === "clear") {
      await db().query("select app.clear_rate_reminder($1)", [clientId]);
      return back("ok=cleared");
    }
    const raw = field(req.body, "target").trim().replace(",", ".");
    if (!/^\d{1,9}(\.\d{1,6})?$/.test(raw)) return back("e=reminder-number");
    await db().query("select app.set_rate_reminder($1, $2::numeric)", [clientId, raw]);
    return back("ok=reminder");
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "23514") return back("e=reminder-range");
    if (code === "P0002") return back("e=reminder-norate");
    if (code === "22P02") return back("e=reminder-number");
    if (code === "42501") return signOut();
    throw err;
  }
}
