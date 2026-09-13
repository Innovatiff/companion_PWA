/**
 * Our Postgres, server side only (see packages/shared/src/server/db.ts).
 *
 * Hoy queries with the connection's own role, which bypasses RLS, so every query
 * is scoped by the client id resolved from the signed session cookie, never by
 * an id sent from the browser (packages/db/migrations/0005_rls.sql).
 */
export { db } from "@leamington/shared/src/server/db.ts";
