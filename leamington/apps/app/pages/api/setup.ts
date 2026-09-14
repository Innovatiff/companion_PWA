/**
 * POST /api/setup: save one setup answer, then go to the next unanswered step
 * (or, when editing from Más, the next step in order).
 *
 * The client id comes from the session cookie only. The database validates
 * every answer (0020): the town must be in their country, at most 3 more towns,
 * no past dates.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { sameOrigin, field } from "@leamington/shared/src/server/portal.ts";
import { db } from "../../lib/db";
import { readSession, cookieValue } from "../../lib/session";

const STEPS = ["municipality", "watch", "segment", "kids", "corridor"];

const id = (v: string): number | null => (/^\d{1,12}$/.test(v) ? Number(v) : null);

export default async function setup(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end();
  }
  if (!sameOrigin(req)) return res.status(403).end();
  const clientId = readSession(cookieValue(req.headers.cookie));
  if (!clientId) return res.redirect(303, "/login");

  const step = field(req.body, "step");
  if (!STEPS.includes(step)) return res.status(400).end();
  const edit = field(req.body, "edit") === "1";
  const action = field(req.body, "action");
  const q = db();

  const back = (e?: string) => {
    const params = new URLSearchParams();
    if (edit) params.set("edit", "1");
    if (e) params.set("e", e);
    const qs = params.toString();
    return res.redirect(303, `/setup/${step}${qs ? `?${qs}` : ""}`);
  };
  const next = async () => {
    if (edit) {
      const i = STEPS.indexOf(step);
      return res.redirect(303, i < STEPS.length - 1 ? `/setup/${STEPS[i + 1]}?edit=1` : "/mas");
    }
    const { rows } = await q.query("select app.setup_next_step($1) as step", [clientId]);
    return res.redirect(303, rows[0]?.step ? `/setup/${rows[0].step}` : "/");
  };

  try {
    if (action === "skip") {
      // Skipping from Más leaves an earlier answer as it was.
      if (!edit) await q.query("select app.setup_mark($1, $2, 'skipped')", [clientId, step]);
      return next();
    }

    if (step === "municipality") {
      const m = id(field(req.body, "municipality_id"));
      if (m == null) return back("pick");
      await q.query("select app.setup_set_municipality($1, $2)", [clientId, m]);
      return next();
    }

    if (step === "watch") {
      const { rows } = await q.query("select municipality_id::int as id from client_watch_locations where client_id = $1", [clientId]);
      const current: number[] = rows.map((r) => r.id);
      const add = id(field(req.body, "add"));
      const remove = id(field(req.body, "remove"));
      if (add != null) {
        const ids = [...new Set([...current, add])];
        if (ids.length > 3) return back("max");
        await q.query("select app.setup_set_watch($1, $2::bigint[])", [clientId, ids]);
        return back();
      }
      if (remove != null) {
        await q.query("select app.setup_set_watch($1, $2::bigint[])", [clientId, current.filter((x) => x !== remove)]);
        return back();
      }
      await q.query("select app.setup_set_watch($1, $2::bigint[])", [clientId, current]);
      return next();
    }

    if (step === "segment") {
      const segment = field(req.body, "segment");
      if (segment !== "seasonal" && segment !== "settled") return back("segment");
      const date = field(req.body, "date");
      if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return back("date");
      await q.query("select app.setup_set_segment($1, $2::client_segment, $3::date)", [clientId, segment, date || null]);
      return next();
    }

    if (step === "kids") {
      const answer = field(req.body, "has_kids");
      if (answer !== "yes" && answer !== "no") return back("invalid");
      await q.query("select app.setup_set_kids($1, $2)", [clientId, answer === "yes"]);
      return next();
    }

    await q.query("select app.setup_confirm_corridor($1)", [clientId]);
    return next();
  } catch (err) {
    const code = (err as { code?: string }).code;
    // 0041: a going-home date before the recorded arrival day has its own reason.
    if (code === "23514" && step === "segment" && /arrival/.test((err as Error).message)) return back("arrival");
    if (code === "23514") return back(step === "segment" ? "date" : step === "watch" ? "max" : "pick");
    if (code === "22007" || code === "22008") return back("date");
    throw err;
  }
}
