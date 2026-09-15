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

/*
 * Categories (0050): highlight | goals | interview | preview | other, from the
 * title only, with classifyTitle's gates, so category in (highlight, goals) is
 * exactly classifyTitle's highlight for the words both know.
 *
 *   other      named talk and magazine shows, other sports, podcasts and analysis,
 *              tickets and trailers, first (even when a player "habla" in them)
 *   interview  press conferences, post-match interviews, statements ("expresa", "speaks")
 *   highlight  a summary word (resumen, highlights, lo mejor, mejores momentos), or a
 *              result line "X 2-1 Y"
 *   goals      a goal word without a summary word (gol, golazo, all goals, top 5 goles)
 *   preview    before a match (previa, preview, se viene, ahead of, dónde ver)
 *   other      live streams and full matches without a highlight word, reactions, the rest
 */
const OTHER_FIRST = [
  "futbol picante", "fuera de juego", "la ultima palabra", "linea de 4", "cuadro titular", "nacion ca", "palabra deportiva",
  "el palco", "color suzuki", "sportsmax zone", "smile jamaica",
  // more talk shows from the 2026-09-15 dry run ("Las RAZONES de la derrota 4-3 ante Cruz Azul | HDP" is not a summary)
  "hdp", "generacion f", "raza deportiva",
  // esports ("Rayados Gaming Cup ya comenzó y te traemos los highlights", 2026-09-15)
  "gaming", "gaming cup", "esports", "e sports", "efootball", "fifa 26", "videojuego", "videojuegos",
  "box azteca", "pelea", "nocaut", "serie del rey", "lmb", "beisbol", "nfl", "nba", "cricket", "windies", "at the track",
  "podcast", "analisis", "mesa de analisis", "tertulia", "debate", "polemica", "opinion", "sorteo", "boletos", "tickets", "unboxing", "trailer",
  "pronostico", "pronosticos", "apuesta", "apuestas", "momios", "betting", "odds",
  // training footage is not a match ("Resumen primer entreno", FEDEFUT; "Reggae Boyz Training", JFF)
  "entreno", "entrenamiento", "entrenamientos", "training",
];
const INTERVIEW = [
  "conferencia", "conferencia de prensa", "rueda de prensa", "press conference", "presser", "entrevista", "interview", "exclusiva",
  "speaks", "reflects", "reacts", "post match", "post partido", "pospartido", "habla", "hablo", "declaraciones", "expresa", "destaca",
  "asegura", "opina", "responde", "revela", "explica", "zona mixta", "mixed zone", "media day", "dia de medios", "sala de prensa",
  // a player telling it ("#LaReacción de Esteban Lozano", "'Sando' nos cuenta en #LaReacción cómo fueron sus dos goles")
  "la reaccion", "lareaccion", "nos cuenta", "platica",
];
const GOALS = ["gol", "goles", "golazo", "golazos", "goal", "goals", "all goals", "every goal", "todos los goles",
  "convierte el", "abre el marcador", "abrir el marcador", "anotacion", "anotaciones", "anota", "anoto", "doblete", "triplete", "scores", "scored", "equaliser", "equalizer", "brace", "hat trick",
  // TVJ Sports' JPL clips ("TAJAY GRANT OPENS THE ACCOUNT! Racing United Strike First", "3–2! Arnett Gardens Fight Back")
  "opens the account", "opens the scoring", "strike first", "strikes first", "fight back", "fights back", "comeback"];
const SUMMARY = HIGHLIGHT.filter((w) => !GOALS.includes(w) && w !== "resumen y goles").concat(["resumen y goles", "mejores momentos", "extended", "match summary"]);
const PREVIEW = [
  "previa", "preview", "se viene", "rumbo a", "rumbo al", "ahead of", "build up", "a que hora", "donde ver", "how to watch", "lo que viene",
  "antesala", "posible alineacion", "posibles alineaciones", "alineacion probable", "pre match", "prematch", "matchday preview", "countdown",
];
const OTHER_F = toSet(OTHER_FIRST);
const INTERVIEW_F = toSet(INTERVIEW);
const GOALS_F = toSet(GOALS);
const SUMMARY_F = toSet(SUMMARY);
const PREVIEW_F = toSet(PREVIEW);

/** { category, why } */
export function classifyVideo(title) {
  const raw = String(title ?? "");
  // "Goool", "GOOOOL", "GOLAAAAAZO" as written on match days.
  const t = fold(raw).replace(/ go{3,}l+ /g, " gol ").replace(/ gola{2,}zo+ /g, " golazo ");
  const other = hasAny(t, OTHER_F);
  if (other) return { category: "other", why: `other:${other.trim()}` };
  const interview = hasAny(t, INTERVIEW_F);
  if (interview) return { category: "interview", why: `interview:${interview.trim()}` };
  const summary = hasAny(t, SUMMARY_F);
  if (summary) return { category: "highlight", why: `word:${summary.trim()}` };
  const goal = hasAny(t, GOALS_F);
  if (goal) return { category: "goals", why: `goals:${goal.trim()}` };
  const preview = hasAny(t, PREVIEW_F);
  if (preview) return { category: "preview", why: `preview:${preview.trim()}` };
  const unless = hasAny(t, UNLESS_F);
  if (unless) return { category: "other", why: `not-unless-said:${unless.trim()}` };
  if (SCORE_LINE.test(raw)) return { category: "highlight", why: "score-line" };
  return { category: "other", why: "no-signal" };
}

export const CATEGORIES = ["highlight", "goals", "interview", "preview", "other"];
