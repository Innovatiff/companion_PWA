/**
 * Whether a video is a match highlight or summary, from its title only.
 * Spanish and English, accent- and case-insensitive, whole words (news/mentions.mjs fold).
 *
 *   - Never: press conferences, podcasts, interviews and analysis shows.
 *   - Not a highlight unless it also says so: live streams and full matches
 *     ("EN VIVO", "partido completo", "full match"), previews, reactions.
 *   - Yes: a highlight word (resumen, highlights, goles, gol, golazo, lo mejor,
 *     mejores jugadas, all goals, ...), or a result line naming two sides and a
 *     score ("SANTOS 2-1 JUÁREZ", "Motagua 1 - 0 Olimpia"), which is how the
 *     league channels title their summaries.
 */
import { fold } from "../news/mentions.mjs";

/** Folded phrases (whole words). */
const NEVER = [
  "conferencia", "conferencia de prensa", "rueda de prensa", "press conference", "presser", "podcast", "entrevista", "interview",
  "exclusiva", "speaks", "reflects", "reacts", "post match", "pre match", "post partido", "habla", "declaraciones",
  "expresa", "destaca", "asegura", "opina", "responde", "revela", "explica",
  "analisis", "mesa de analisis", "tertulia", "debate", "polemica", "opinion", "sorteo", "boletos", "tickets", "unboxing", "trailer",
  // talk and magazine shows seen in the verified feeds (2026-09-14)
  "futbol picante", "fuera de juego", "la ultima palabra", "linea de 4", "cuadro titular", "nacion ca", "palabra deportiva",
  "el palco", "color suzuki", "sportsmax zone", "smile jamaica",
  // other sports the broadcasters post
  "box azteca", "pelea", "nocaut", "serie del rey", "lmb", "beisbol", "nfl", "nba", "cricket", "windies", "at the track",
];
const UNLESS_SAID = [
  "en vivo", "en directo", "live", "livestream", "live stream", "partido completo", "full match", "full game", "transmision",
  "previa", "preview", "reaccion", "reaction", "pasillo", "pov", "vlog",
];
const HIGHLIGHT = [
  "resumen", "resumenes", "highlights", "highlight", "extended highlights", "match highlights", "goles", "gol", "golazo", "golazos",
  "lo mejor", "mejores jugadas", "jugadas", "all goals", "every goal", "goals", "goal", "resumen y goles", "compacto", "recap",
];
const toSet = (list) => list.map((p) => fold(p));
const NEVER_F = toSet(NEVER);
const UNLESS_F = toSet(UNLESS_SAID);
const HIGHLIGHT_F = toSet(HIGHLIGHT);

/** "X 2-1 Y", "X 1 - 0 Y", "X (2) 1-1 (4) Y": letters, a score, letters. On the raw title. */
const SCORE_LINE = /\p{L}[\p{L}.'’)\s]*\s\(?\d{1,2}\)?\s*[-–:]\s*\(?\d{1,2}\)?\s+\p{L}/u;

const hasAny = (hay, list) => list.find((p) => p.trim() && hay.includes(p)) ?? null;

/** { highlight: boolean, why: string } */
export function classifyTitle(title) {
  const raw = String(title ?? "");
  const t = fold(raw);
  const never = hasAny(t, NEVER_F);
  if (never) return { highlight: false, why: `never:${never.trim()}` };
  const word = hasAny(t, HIGHLIGHT_F);
  const unless = hasAny(t, UNLESS_F);
  if (word) return { highlight: true, why: `word:${word.trim()}` };
  if (unless) return { highlight: false, why: `not-unless-said:${unless.trim()}` };
  if (SCORE_LINE.test(raw)) return { highlight: true, why: "score-line" };
  return { highlight: false, why: "no-signal" };
}

export const isHighlight = (title) => classifyTitle(title).highlight;
