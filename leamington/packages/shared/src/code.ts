/**
 * Client access codes.
 *
 * The code IS the account. There is no email, no password, no SMS, and no
 * recovery channel other than typing the code in again. That puts two hard
 * constraints on the alphabet:
 *
 *  1. An affiliate reads the code aloud in a field or a parking lot, and the
 *     worker types it on a cheap Android keyboard. So no character pairs that
 *     are ambiguous spoken or on screen: O/0, I/1/L, S/5, B/8, U/V.
 *  2. It must survive being written on paper and re-entered months later on a
 *     replacement phone.
 *
 * 24 symbols ** 8 positions ~= 1.1e11 codes. At 10k clients the probability of
 * any collision is ~4e-4, and `clients.code` is UNIQUE, so a collision is a
 * retry rather than a corrupted account.
 */

/** Unambiguous uppercase alphanumerics. Deliberately excludes I, L, O, S, U, 0, 1, 5, 8. */
export const CODE_ALPHABET = "ACDEFGHJKMNPQRTVWXYZ2346" as const;
export const CODE_LENGTH = 8;

/** Characters people commonly substitute, mapped to what they meant. */
const CONFUSIONS: Record<string, string> = {
  O: "Q", // visually nearest survivor
  "0": "Q",
  I: "J",
  L: "J",
  "1": "J",
  S: "Z",
  "5": "Z",
  B: "P",
  "8": "P",
  U: "V",
};

function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  crypto.getRandomValues(out);
  return out;
}

/**
 * Generate a code. Uses rejection sampling so every symbol is equally likely —
 * a plain modulo would bias the first few letters of the alphabet.
 */
export function generateCode(length: number = CODE_LENGTH): string {
  const alphabet = CODE_ALPHABET;
  const limit = Math.floor(256 / alphabet.length) * alphabet.length;
  let out = "";
  while (out.length < length) {
    for (const byte of randomBytes(length * 2)) {
      if (byte >= limit) continue; // reject, to keep the distribution uniform
      out += alphabet[byte % alphabet.length];
      if (out.length === length) break;
    }
  }
  return out;
}

/**
 * Normalise what the user actually typed: trim, strip separators, uppercase,
 * and repair the predictable mis-hearings. Someone who writes "0" for "Q" or
 * "1" for "J" still gets into their account.
 */
export function normalizeCode(input: string): string {
  const cleaned = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  let out = "";
  for (const ch of cleaned) out += CONFUSIONS[ch] ?? ch;
  return out;
}

export function isValidCode(input: string): boolean {
  const c = normalizeCode(input);
  if (c.length !== CODE_LENGTH) return false;
  for (const ch of c) if (!CODE_ALPHABET.includes(ch)) return false;
  return true;
}

/** Display form: ABCD-1234. Easier to read back over a phone. */
export function formatCode(code: string): string {
  const c = normalizeCode(code);
  return c.length === 8 ? `${c.slice(0, 4)}-${c.slice(4)}` : c;
}
