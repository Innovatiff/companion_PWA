/**
 * Where a request came from, for throttling, stored only as a hash. The scope
 * keeps client-code and portal sign-in failures in separate buckets.
 */
import { createHash } from "node:crypto";
import type { IncomingMessage } from "node:http";

export function sourceHash(req: IncomingMessage, scope: "client" | "affiliate" | "owner"): string {
  const forwarded = req.headers["x-forwarded-for"];
  const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim()
    || req.socket.remoteAddress || "unknown";
  return createHash("sha256").update(`${scope}|${ip}|${process.env.SESSION_SECRET ?? ""}`).digest("hex");
}
