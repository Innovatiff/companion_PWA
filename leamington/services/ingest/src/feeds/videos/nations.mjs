/**
 * Which national team a video is about ("Tu selección"), from its title,
 * precomputed at ingest into video_nations. Names in nation-aliases.json.
 * Like club matching (teams.mjs) it errs toward saying nothing:
 *
 *   - A national federation's own channel (kind 'national'): a video counts for
 *     its country when the title names the team (an alias, a guarded name or a
 *     signal: "Selección", "La H", "Reggae Boyz"), for the women's team when it
 *     says women (rule national_channel). The federations also post referee
 *     analysis, youth sides and, on FMF and JFF, the women's team under titles
 *     that name nobody ("Coach Hubert Busby speaks after 0-0 draw with Panama"
 *     is the Reggae Girlz' coach): those count for no one.
 *   - An ALIAS ("Selección Mexicana", "El Tri", "Reggae Boyz") counts in any
 *     channel's title (rule alias).
 *   - A GUARDED name, also a country, place, people or word ("México",
 *     "Catrachos", "la Bicolor"), counts only in a match title against another
 *     national team: "México vs Panamá", "Honduras 2-1 Costa Rica" (rule name+match).
 *   - Places, leagues and clubs named like a country ("Ciudad de México",
 *     "Liga Nacional de Guatemala", "Jamaica College", "Honduras Progreso") are
 *     removed first.
 *   - Youth, Olympic, beach, futsal and esports sides name no senior team: nothing.
 *   - The women's team ("Reggae Girlz", "Femenil", "Women") is stored with
 *     women = true, never as the men's.
 */
import { readFileSync } from "node:fs";
import { tokens, phraseTokens, occurrences, blankNot, BETWEEN_OK } from "./teams.mjs";

export const NATION_DATA = JSON.parse(readFileSync(new URL("./nation-aliases.json", import.meta.url), "utf8"));

const phrases = (list) => (list ?? []).map((text) => ({ text, toks: phraseTokens(text) })).filter((p) => p.toks.length);

export function buildNationIndex(data = NATION_DATA) {
  return {
    teams: data.teams.map((t) => ({ country: t.country, aliases: phrases(t.aliases), women: phrases(t.women_aliases), guarded: phrases(t.guarded), signals: phrases(t.signals) })),
    womenWords: phrases(data.women),
    skip: phrases(data.skip),
    not: phrases(data.not).map((p) => p.toks),
    opponents: phrases(data.opponents),
  };
}

const DEFAULT_INDEX = buildNationIndex();
const overlaps = (a, b) => a[0] < b[1] && b[0] < a[1];

/**
 * [{country, women, matched, rule}] for a video title.
 * `channel`: {kind, country, women, name}.
 */
export function matchNations({ title }, channel = {}, index = DEFAULT_INDEX) {
  const raw = tokens(title);
  if (index.skip.some((s) => occurrences(raw, s.toks).length)) return [];
  const toks = blankNot(raw, index.not);
  const womenWord = index.womenWords.some((w) => occurrences(toks, w.toks).length);

  const out = new Map();
  const put = (country, women, matched, rule) => {
    const k = `${country}:${women}`;
    if (!out.has(k)) out.set(k, { country, women, matched: String(matched).slice(0, 120), rule });
  };

  if (channel.kind === "national" && channel.country) {
    const t = index.teams.find((x) => x.country === channel.country);
    const womenAlias = t?.women.some((a) => occurrences(toks, a.toks).length);
    const named = t && [...t.aliases, ...t.guarded, ...t.signals].some((a) => occurrences(toks, a.toks).length);
    if (channel.women || womenWord || womenAlias) put(channel.country, true, channel.name ?? "national channel", "national_channel");
    else if (named) put(channel.country, false, channel.name ?? "national channel", "national_channel");
  }

  // Aliases: women's aliases are the women's team whatever else the title says.
  for (const t of index.teams) {
    for (const a of t.women) if (occurrences(toks, a.toks).length) put(t.country, true, a.text, "alias");
    for (const a of t.aliases) {
      const at = occurrences(toks, a.toks);
      if (!at.length) continue;
      // A men's alias inside a women's alias ("Selección Mexicana" in "Selección Mexicana Femenil") is that alias.
      const inWomen = at.every((span) => t.women.some((w) => occurrences(toks, w.toks).some((ws) => ws[0] <= span[0] && ws[1] >= span[1])));
      if (inWomen) continue;
      put(t.country, womenWord, a.text, "alias");
    }
  }

  // Guarded names: only next to another national team across "vs", "-" or a score. Women's words
  // are left out of that check, so "México Femenil vs Canadá" is still a match line (and women's).
  const womenAt = new Set(index.womenWords.flatMap((w) => occurrences(toks, w.toks).flatMap(([a, b]) => Array.from({ length: b - a }, (_, i) => a + i))));
  const adj = toks.filter((_, i) => !womenAt.has(i));
  const others = [
    ...index.opponents.map((o) => ({ ...o, country: null })),
    ...index.teams.flatMap((t) => [...t.aliases, ...t.guarded].map((n) => ({ ...n, country: t.country }))),
  ];
  for (const t of index.teams) {
    for (const g of t.guarded) {
      for (const span of occurrences(adj, g.toks)) {
        const opponent = others.some((o) => o.country !== t.country && !o.toks.every((x, i) => g.toks[i] === x && o.toks.length === g.toks.length)
          && occurrences(adj, o.toks).some((os) => !overlaps(os, span)
            && BETWEEN_OK(os[0] >= span[1] ? adj.slice(span[1], os[0]) : adj.slice(os[1], span[0]))));
        if (opponent) { put(t.country, womenWord, g.text, "name+match"); break; }
      }
    }
  }
  return [...out.values()];
}
