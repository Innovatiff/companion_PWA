/**
 * Pure helpers for registering a client: reading and checking the four fields,
 * sending the typed values back to the form, and retrying a code that collided.
 */
import { isCountry, type Country } from "./clients.ts";

export const NAME_MAX = 120;

/** The team select's explicit "no team" answer. */
export const NO_TEAM = "none";

export type RegisterInput = { country: string; name: string; region: string; team: string };

export type RegisterError = "country" | "name" | "region" | "team" | "code" | "rejected";

const REGISTER_ERRORS: readonly RegisterError[] = ["country", "name", "region", "team", "code", "rejected"];
export const isRegisterError = (v: unknown): v is RegisterError =>
  typeof v === "string" && (REGISTER_ERRORS as readonly string[]).includes(v);

const one = (v: unknown): string => (typeof v === "string" ? v : Array.isArray(v) && typeof v[0] === "string" ? v[0] : "");

/** Trimmed values from a form body or a query string; the name's inner spaces collapsed. */
export function readRegisterInput(source: unknown): RegisterInput {
  const s = (source ?? {}) as Record<string, unknown>;
  return {
    country: one(s.country).trim().toUpperCase(),
    name: one(s.name).replace(/\s+/g, " ").trim().slice(0, NAME_MAX * 2),
    region: one(s.region).trim(),
    team: one(s.team).trim(),
  };
}

/**
 * The first problem with the form, in field order, or null. `regions` and
 * `teamIds` are what our database lists for the chosen country. A team is
 * required when the country has teams ("Ninguno" is an answer); when it has
 * none, the field is not shown and nothing is required.
 */
export function validateRegister(input: RegisterInput, regions: readonly string[], teamIds: readonly string[]): RegisterError | null {
  if (!isCountry(input.country)) return "country";
  if (input.name.length < 2 || input.name.length > NAME_MAX) return "name";
  if (!regions.includes(input.region)) return "region";
  if (teamIds.length > 0 && input.team !== NO_TEAM && !teamIds.includes(input.team)) return "team";
  if (teamIds.length === 0 && input.team !== "" && input.team !== NO_TEAM) return "team";
  return null;
}

/** The team id for app.register_client: null for "no team". Call only after validateRegister. */
export const teamIdFor = (input: RegisterInput): number | null =>
  input.team === "" || input.team === NO_TEAM ? null : Number(input.team);

/** Back to step 2 with what was typed and the reason, so nothing is typed twice. */
export function registerFormUrl(input: RegisterInput, error: RegisterError | null): string {
  const q = new URLSearchParams();
  if (isCountry(input.country)) q.set("country", input.country);
  if (input.name) q.set("name", input.name.slice(0, NAME_MAX));
  if (input.region) q.set("region", input.region);
  if (input.team) q.set("team", input.team);
  if (error) q.set("e", error);
  const s = q.toString();
  return s ? `/register?${s}` : "/register";
}

export class CodeExhaustedError extends Error {
  attempts: number;
  constructor(attempts: number) {
    super(`every generated code collided (${attempts} attempts)`);
    this.attempts = attempts;
  }
}

const isUniqueViolation = (err: unknown): boolean => (err as { code?: unknown } | null)?.code === "23505";

/**
 * Run `attempt` with a fresh code until it does not collide. A unique_violation
 * (SQLSTATE 23505) aborts that transaction, so each try must be its own
 * transaction; any other error is thrown at once.
 */
export async function withFreshCode<T>(
  attempt: (code: string) => Promise<T>,
  makeCode: () => string,
  tries = 5,
): Promise<T> {
  for (let i = 0; i < tries; i++) {
    try {
      return await attempt(makeCode());
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
    }
  }
  throw new CodeExhaustedError(tries);
}

export type { Country };
