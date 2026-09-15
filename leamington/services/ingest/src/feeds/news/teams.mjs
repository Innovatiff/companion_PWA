/**
 * Which clubs a news story is about, precomputed at news ingest into
 * news_teams (0050). It reuses the video matcher's names and guards
 * (videos/teams.mjs, videos/team-aliases.json) and is stricter, because news
 * is mostly not football and club names are words, places and institutions
 * ("América Latina", "Policía Municipal", "río Motagua", "victoria del candidato"):
 *
 *   - Only clubs of the outlet's country; title and summary only.
 *   - A women's, youth or reserve side named anywhere in the story: nothing.
 *   - Phrases that are not the club (the video list's `not`, and `news.not`) are removed first.
 *   - An ALIAS ("Motagua", "Comunicaciones") counts with a football word in the
 *     story (rule alias+context), or when another club of its league is named
 *     too (rule alias+club).
 *   - A GUARDED name ("Municipal", "Olimpia", "América", "Victoria") counts only
 *     with a football word AND either a match line with another club of its
 *     league ("Municipal vs Xelajú", rule name+match) or right after "el", "del"
 *     or "al" ("la derrota del América", rule name+article).
 *   - A football word inside a phrase that is not football ("partido político",
 *     "equipo técnico") does not count.
 *
 * What matched is stored, so a wrong match can be seen and the data tightened.
 */
import { fold } from "./mentions.mjs";
import { tokens, occurrences, blankNot, BETWEEN_OK } from "../videos/teams.mjs";

const ARTICLES = new Set(["el", "del", "al"]);

/** The football word a story carries, or null. Folded text: "contra" and "x" stay words here. */
export function footballContext(text, index) {
  let t = fold(String(text ?? "").replace(/🆚/gu, " vs "));
  for (const p of index.news.notContext) t = t.split(` ${p.join(" ")} `).join(" ");
  return index.news.context.map((c) => c.join(" ")).find((c) => t.includes(` ${c} `)) ?? null;
}

/**
 * [{teamId, matched, rule}] for a story. `source`: {country}; `index`: videos/teams.mjs buildTeamIndex(teams).
 */
export function matchNewsTeams({ title, summary }, source, index) {
  const text = `${title ?? ""} . ${summary ?? ""}`;
  const raw = tokens(text);
  if (index.squads.some((s) => occurrences(raw, s).length)) return [];
  const toks = blankNot(blankNot(raw, index.not), index.news.not);
  const candidates = index.byCountry.get(source.country) ?? [];
  if (!candidates.length) return [];
  const context = footballContext(text, index);

  const hits = [];
  for (const c of candidates) for (const n of c.names) for (const at of occurrences(toks, n.toks)) hits.push({ c, n, at });
  const kept = hits.filter((h) => !hits.some((o) => o !== h && o.at[0] <= h.at[0] && o.at[1] >= h.at[1] && (o.at[1] - o.at[0]) > (h.at[1] - h.at[0])));

  const guardedOk = new Map();   // hit -> rule
  for (const h of kept.filter((x) => x.n.guarded)) {
    if (!context) continue;
    const team = h.c.team;
    const opponent = kept.some((o) => o.c.team.id !== team.id && o.c.team.league_id === team.league_id
      && BETWEEN_OK(o.at[0] >= h.at[1] ? raw.slice(h.at[1], o.at[0]) : raw.slice(o.at[1], h.at[0])));
    if (opponent) guardedOk.set(h, "name+match");
    else if (h.at[0] > 0 && ARTICLES.has(raw[h.at[0] - 1])) guardedOk.set(h, "name+article");
  }

  const out = new Map();
  const put = (team, matched, rule) => { if (!out.has(team.id)) out.set(team.id, { teamId: team.id, matched: matched.slice(0, 120), rule }); };
  for (const [h, rule] of guardedOk) put(h.c.team, h.n.text, rule);
  const named = [...kept.filter((x) => !x.n.guarded), ...guardedOk.keys()];
  for (const h of kept.filter((x) => !x.n.guarded)) {
    if (context) { put(h.c.team, h.n.text, "alias+context"); continue; }
    if (named.some((o) => o.c.team.id !== h.c.team.id && o.c.team.league_id === h.c.team.league_id)) put(h.c.team, h.n.text, "alias+club");
  }
  return [...out.values()];
}
