/**
 * /health for the three web surfaces.
 *
 * It answers one question: can this surface serve pages from our database right
 * now? A database that does not answer is "unknown" with 503, never "ok". It
 * says nothing about whether the feeds are current; that is the ingest
 * service's /health.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { db } from "./db";

export function healthHandler(surface: string) {
  return async function health(_req: NextApiRequest, res: NextApiResponse) {
    res.setHeader("Cache-Control", "no-store");
    const checkedAt = new Date().toISOString();
    try {
      // Reachability is the check; the migration name is reported when the
      // migration log exists (a local test database has none).
      const { rows } = await db().query("select to_regclass('public.schema_migrations') is not null as logged");
      const migration = rows[0]?.logged
        ? (await db().query("select max(filename) as migration from schema_migrations")).rows[0]?.migration ?? null
        : null;
      res.status(200).json({
        status: "ok",
        surface,
        database: "reachable",
        migration,
        checkedAt,
        note: "this surface can read our database; feed freshness is reported by the ingest service",
      });
    } catch (err) {
      res.status(503).json({
        status: "unknown",
        surface,
        database: "unreachable",
        error: String((err as Error)?.message ?? err),
        checkedAt,
      });
    }
  };
}
