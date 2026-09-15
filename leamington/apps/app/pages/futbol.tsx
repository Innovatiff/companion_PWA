/**
 * Fútbol: their team (or, without a team, their country's league) as a hero
 * with crest, league logo and flag, form and goals from real results; the next
 * match with stadium and round; results; and today and this week in their league
 * and today in the other leagues we follow, each grouped under its league's logo.
 * The table only where current-season standings exist (0015).
 *
 * Schedules show only while the fixtures feed is current (0036), and a match
 * past its kickoff without a final result is left out rather than shown stale.
 * Results are final and show with their date. Never a live score: a score
 * appears only on a finished match. An empty list renders nothing, never
 * "no matches". Crests and league logos come from our own domain when stored.
 *
 * Fútbol v2 (0050, OPEN-DECISIONS 3.25, 3.26): the football provider is thin, so
 * the page is rich from videos and news, right after the hero: section jump
 * pills; "Lo mejor de {team}" (the newest highlight or goals video big, then a
 * strip); Cortos (vertical Shorts); the league's highlights; their national team
 * (and the women's, separately, only when there are any); news about their team.
 * Every video links to YouTube with our cached thumbnail; never a player, and one
 * note that watching opens YouTube and uses a lot of data. Strips hold 4; the
 * full lists live on /futbol/videos. A section without content is not rendered.
 */
import Head from "next/head";
import type { GetServerSideProps } from "next";
import { TabBar } from "../lib/frame";
import { formatTime12, formatWeekdayDate, localDate } from "@leamington/shared/src/format.ts";
import { db } from "../lib/db";
import { loadClient, recordView } from "../lib/client";
import { t } from "../lib/t";
import { Crest, FLAG, Icon, LeagueLogo, roundName } from "../lib/ui";
import { FUTBOL_CSS, NEWSROW_CSS, TABLE_CSS } from "../lib/page-css";
import { ShortsNote, VideoCard, VideoNote, nationName, type Video } from "../lib/videos";
import { NewsRow, type NewsItem } from "../lib/news";

export const config = { unstable_runtimeJS: false };

type Match = {
  id: number; kickoff: string; status: string; home: string; away: string; home_id: number; away_id: number;
  home_crest: boolean; away_crest: boolean; home_score?: number; away_score?: number; is_today: boolean;
  venue?: string; city?: string; round?: string; league: string; league_id: number; league_country: string; league_crest: boolean;
};
type Standing = { group: string | null; rank: number; team: string; points: number; played: number };
type Football = {
  language: "es" | "en"; timezone: string; country: string;
  team: string | null; team_id: number | null; team_crest: boolean | null;
  league: string | null; league_id: number | null; league_crest: boolean | null; fixtures_current: boolean;
  upcoming?: Match[] | null; results?: Match[] | null; form?: ("W" | "D" | "L")[] | null;
  goals?: { matches: number; for: number; against: number } | null;
  league_today?: Match[] | null; league_recent?: Match[] | null; region_today?: Match[] | null;
  table?: { state: string; reason: string | null; rows: Standing[] | null } | null;
  videos?: { team: Video[]; league: Video[]; shorts: Video[]; national: Video[]; updated_at: string | null; stale: boolean } | null;
  team_news?: { items: NewsItem[]; updated_at: string | null; stale: boolean } | null;
};
type Props = { f: Football; women: Video[]; now: string };

/** Cards in each strip on this page; /futbol/videos has the full lists. */
export const STRIP = 4;

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const loaded = await loadClient(ctx);
  if ("redirect" in loaded) return loaded;
  // The women's national team is not in football_page: read it once, with the strips' limit.
  const [{ rows }, womenRows] = await Promise.all([
    db().query("select app.football_page($1) as f", [loaded.client.id]),
    db().query("select app.football_videos($1, now(), $2)->'national_women' as w", [loaded.client.id, STRIP]),
  ]);
  const f = rows[0]?.f as Football;
  const women = (womenRows.rows[0]?.w ?? []) as Video[];
  await recordView(loaded.client.id, "futbol", {
    team: Boolean(f.team), league: f.league_id ?? null, fixtures_current: f.fixtures_current,
    upcoming: f.upcoming?.length ?? null, results: f.results?.length ?? null,
    league_today: f.league_today?.length ?? null, league_recent: f.league_recent?.length ?? null,
    region_today: f.region_today?.length ?? null,
    table: f.table?.state ?? null, table_reason: f.table?.reason ?? null,
    videos_team: f.videos?.team.length ?? null, videos_league: f.videos?.league.length ?? null, videos_shorts: f.videos?.shorts.length ?? null,
    videos_national: f.videos?.national.length ?? null, videos_women: women.length, team_news: f.team_news?.items.length ?? null,
  });
  return { props: { f, women, now: new Date().toISOString() } };
};

const STATUS: Record<string, [string, string]> = {
  live: ["En juego", "Playing now"],
  postponed: ["Aplazado", "Postponed"],
  cancelled: ["Cancelado", "Cancelled"],
};
// Form letters: Ganado / Empate / Perdido.
const LETTER: Record<string, [string, string]> = { W: ["G", "W"], D: ["E", "D"], L: ["P", "L"] };
const HOUR = 3_600_000;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function Futbol({ f, women, now }: Props) {
  const lang = f.language;
  const en = lang === "en";
  const tz = f.timezone;
  const nowMs = Date.parse(now);

  const final = (m: Match) => m.status === "finished" && m.home_score != null && m.away_score != null;
  // A match is shown if final, postponed or cancelled, or not yet two hours past kickoff.
  const open = (m: Match) => final(m) || m.status === "postponed" || m.status === "cancelled" || Date.parse(m.kickoff) + 2 * HOUR > nowMs;
  const status = (m: Match) => STATUS[m.status]?.[en ? 1 : 0];
  const longDay = (m: Match) => cap(formatWeekdayDate(localDate(m.kickoff, tz), lang));
  const shortDay = (m: Match) => {
    const day = localDate(m.kickoff, tz);
    return `${cap(formatWeekdayDate(day, lang).slice(0, 3))} ${Number(day.slice(8))}`;
  };
  const when = (m: Match) => `${m.is_today ? t(lang, "Hoy", "Today") : shortDay(m)} · ${formatTime12(m.kickoff, tz)}`;
  const outcome = (m: Match) => {
    const mine = m.home_id === f.team_id ? m.home_score! : m.away_score!;
    const theirs = m.home_id === f.team_id ? m.away_score! : m.home_score!;
    return mine > theirs ? "W" : mine < theirs ? "L" : "D";
  };

  const [next, ...later] = (f.upcoming ?? []).filter(open);
  const results = (f.results ?? []).filter(final);
  const form = results.length > 0 ? f.form ?? [] : [];
  const leagueToday = (f.league_today ?? []).filter(open);
  const recent = (f.league_recent ?? []).filter(final);
  const region = (f.region_today ?? []).filter(open);
  const regionGroups = [...new Set(region.map((m) => m.league_id))].map((id) => region.filter((m) => m.league_id === id));
  const tableGroups = f.table?.state === "available" && f.table.rows
    ? [...new Set(f.table.rows.map((r) => r.group ?? ""))] : [];
  const seeAll = t(lang, "Ver todo", "See all");
  // Videos: the newest highlight or goals video of their team is featured; each strip holds STRIP.
  const teamAll = f.team ? f.videos?.team ?? [] : [];
  const featured = [...teamAll].filter((v) => v.category === "highlight" || v.category === "goals")
    .sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at))[0] ?? null;
  const teamRest = teamAll.filter((v) => v !== featured).slice(0, STRIP);
  const shorts = (f.videos?.shorts ?? []).slice(0, STRIP);
  const leagueVideos = (f.videos?.league ?? []).slice(0, STRIP);
  const national = (f.videos?.national ?? []).slice(0, STRIP);
  const womenVideos = women.slice(0, STRIP);
  const teamNews = f.team_news?.items ?? [];
  const hasTeamVideos = Boolean(featured) || teamRest.length > 0;
  const anyVideo = hasTeamVideos || shorts.length > 0 || leagueVideos.length > 0 || national.length > 0 || womenVideos.length > 0;
  const strip = (list: Video[]) => <div className="vstrip">{list.map((v) => <VideoCard key={v.id} v={v} lang={lang} tz={tz} nowMs={nowMs} />)}</div>;
  const jumps: [string, string][] = [
    ...(hasTeamVideos || leagueVideos.length > 0 ? [["videos", t(lang, "Videos", "Videos")] as [string, string]] : []),
    ...(shorts.length > 0 ? [["cortos", t(lang, "Cortos", "Shorts")] as [string, string]] : []),
    ...(national.length > 0 || womenVideos.length > 0 ? [["seleccion", t(lang, "Selección", "National team")] as [string, string]] : []),
    ...(teamNews.length > 0 ? [["noticias", t(lang, "Noticias", "News")] as [string, string]] : []),
    ...(results.length > 0 || recent.length > 0 ? [["resultados", t(lang, "Resultados", "Results")] as [string, string]] : []),
  ];

  // One match as a row: both teams with crest or initials; the final score, or the kickoff (or status) chip.
  const row = (m: Match, sub?: string | null) => (
    <li className="fx" key={m.id}>
      <span className="h"><Crest id={m.home_id} name={m.home} has={m.home_crest} size={30} /><b>{m.home}</b></span>
      {final(m) ? <b className="sc">{`${m.home_score}–${m.away_score}`}</b> : <span className="chip">{status(m) ?? formatTime12(m.kickoff, tz)}</span>}
      <span className="a"><b>{m.away}</b><Crest id={m.away_id} name={m.away} has={m.away_crest} size={30} /></span>
      {sub && <small>{sub}</small>}
    </li>
  );
  // Matches of one league under its logo, name and flag.
  const group = (matches: Match[], sub?: (m: Match) => string | null) => {
    const l = matches[0];
    return (
      <section className="card grp" key={l.league_id}>
        <header>
          <LeagueLogo id={l.league_id} has={l.league_crest} size={30} />
          <h3>{l.league}</h3>
          {FLAG[l.league_country] && <span className="flag">{FLAG[l.league_country]}</span>}
        </header>
        <ul className="fxs">{matches.map((m) => row(m, sub?.(m)))}</ul>
      </section>
    );
  };

  return (
    <>
      <Head>
        <title>{`${t(lang, "Fútbol", "Football")} · Hoy`}</title>
        <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
        <style dangerouslySetInnerHTML={{ __html: FUTBOL_CSS + (tableGroups.length > 0 ? TABLE_CSS : "") + (f.team_news?.items.length ? NEWSROW_CSS : "") }} />
      </Head>
      <main>
        <section className="hero">
          {f.league && (
            <p className="top">
              <LeagueLogo id={f.league_id} has={f.league_crest} size={26} />
              <span>{f.league}</span>
              {FLAG[f.country] && <span className="flag">{FLAG[f.country]}</span>}
            </p>
          )}
          <div className="id">
            {f.team
              ? <Crest id={f.team_id} name={f.team} has={f.team_crest} size={76} />
              : f.league_crest
                ? <LeagueLogo id={f.league_id} has={f.league_crest} size={76} />
                // No stored logo: the country's flag in a badge; the league's name is beside it.
                : FLAG[f.country] && <span className="lgb" aria-hidden="true">{FLAG[f.country]}</span>}
            <div>
              <h1>{f.team ?? f.league ?? t(lang, "Fútbol", "Football")}</h1>
              <p>{f.team ? t(lang, "Tu equipo", "Your team") : f.league ? t(lang, "La liga de tu país", "Your country's league") : ""}</p>
            </div>
          </div>
          {form.length > 0 && (
            <div className="form">
              <small>{t(lang, "Forma", "Form")}</small>
              {form.map((r, i) => <b key={i} className={`fc ${r}`}>{LETTER[r][en ? 1 : 0]}</b>)}
              <small className="lgd">{t(lang, "G ganado · E empate · P perdido", "W won · D drew · L lost")}</small>
            </div>
          )}
          {results.length > 0 && f.goals && f.goals.matches > 0 && (
            <div className="stats">
              <span><b>{f.goals.for}</b><small>{t(lang, "goles a favor", "goals for")}</small></span>
              <span><b>{f.goals.against}</b><small>{t(lang, "goles en contra", "goals against")}</small></span>
              <span><b>{f.goals.matches}</b><small>{t(lang, "últimos partidos", "recent matches")}</small></span>
            </div>
          )}
        </section>

        {jumps.length > 0 && (
          <nav className="seg jump" aria-label={t(lang, "Secciones", "Sections")}>
            {jumps.map(([id, text]) => <a key={id} href={`#${id}`}>{text}</a>)}
          </nav>
        )}
        {anyVideo && <VideoNote lang={lang} />}

        {hasTeamVideos && (
          <section className="vids" id="videos" data-videos="team">
            <div className="sh"><h2>{t(lang, `Lo mejor de ${f.team}`, `The best of ${f.team}`)}</h2><a href="/futbol/videos">{seeAll}</a></div>
            {featured && <VideoCard v={featured} lang={lang} tz={tz} nowMs={nowMs} big />}
            {teamRest.length > 0 && strip(teamRest)}
          </section>
        )}
        {shorts.length > 0 && (
          <section className="vids" id="cortos" data-videos="shorts">
            <div className="sh"><h2>{t(lang, "Cortos", "Shorts")}</h2><a href="/futbol/videos?s=shorts">{seeAll}</a></div>
            <ShortsNote lang={lang} />
            {strip(shorts)}
          </section>
        )}
        {leagueVideos.length > 0 && (
          <section className="vids" id={hasTeamVideos ? undefined : "videos"} data-videos="league">
            <div className="sh"><h2>{t(lang, "Resúmenes de la liga", "League highlights")}</h2><a href="/futbol/videos?s=league">{seeAll}</a></div>
            {strip(leagueVideos)}
          </section>
        )}
        {national.length > 0 && (
          <section className="vids" id="seleccion" data-videos="national">
            <div className="sh"><h2>{`${t(lang, "Tu selección", "Your national team")} ${FLAG[f.country] ?? ""}`.trim()}</h2><a href="/futbol/videos?s=national">{seeAll}</a></div>
            <p className="snote">{nationName(f.country, lang)}</p>
            {strip(national)}
          </section>
        )}
        {womenVideos.length > 0 && (
          <section className="vids" id={national.length > 0 ? undefined : "seleccion"} data-videos="women">
            <div className="sh"><h2>{t(lang, "Selección femenil", "Women's national team")}</h2><a href="/futbol/videos?s=women">{seeAll}</a></div>
            {strip(womenVideos)}
          </section>
        )}
        {teamNews.length > 0 && (
          <section id="noticias" data-news="team">
            <div className="sh"><h2>{t(lang, `Noticias de ${f.team}`, `${f.team} news`)}</h2><a href="/noticias">{seeAll}</a></div>
            {teamNews.map((n) => <NewsRow key={n.id} n={n} lang={lang} tz={tz} nowMs={nowMs} towns={false} compact />)}
          </section>
        )}

        {next && (
          <>
            <h2>{t(lang, "Próximo partido", "Next match")}</h2>
            <section className="card match nx">
              <small>{[roundName(next.round, lang), status(next)].filter(Boolean).join(" · ") || next.league}</small>
              <span><Crest id={next.home_id} name={next.home} has={next.home_crest} size={64} />{next.home}</span>
              <b className="chip">{when(next)}</b>
              <span><Crest id={next.away_id} name={next.away} has={next.away_crest} size={64} />{next.away}</span>
              {(next.venue || next.city) && (
                <p className="venue"><span className="i"><Icon name="pin" /></span>{[next.venue, next.city].filter(Boolean).join(", ")}</p>
              )}
            </section>
            {later.length > 0 && (
              <section className="card grp">
                <ul className="fxs">{later.map((m) => row(m, [shortDay(m), roundName(m.round, lang)].filter(Boolean).join(" · ")))}</ul>
              </section>
            )}
          </>
        )}

        {results.length > 0 && (
          <>
            <h2 id="resultados">{t(lang, "Resultados", "Results")}</h2>
            {results.map((m) => {
              const r = outcome(m);
              return (
                <section className={`card match res ${r}`} key={m.id}>
                  <small><b className={`fc ${r}`}>{LETTER[r][en ? 1 : 0]}</b>{` ${longDay(m)}${m.round ? ` · ${roundName(m.round, lang)}` : ""}`}</small>
                  <span><Crest id={m.home_id} name={m.home} has={m.home_crest} size={44} />{m.home}</span>
                  <b className="score">{`${m.home_score}–${m.away_score}`}</b>
                  <span><Crest id={m.away_id} name={m.away} has={m.away_crest} size={44} />{m.away}</span>
                </section>
              );
            })}
          </>
        )}

        {leagueToday.length > 0 && (
          <>
            <h2>{t(lang, "Hoy en la liga", "In the league today")}</h2>
            {group(leagueToday, (m) => m.venue ?? null)}
          </>
        )}

        {recent.length > 0 && (
          <>
            <h2 id={results.length > 0 ? undefined : "resultados"}>{t(lang, "Resultados de la semana", "This week's results")}</h2>
            {group(recent, (m) => shortDay(m))}
          </>
        )}

        {regionGroups.length > 0 && (
          <>
            <h2>{t(lang, "Otras ligas hoy", "Other leagues today")}</h2>
            {regionGroups.map((g) => group(g))}
          </>
        )}

        {tableGroups.map((g) => (
          <div className="wrap" key={g}>
            <table>
              <caption>{g || t(lang, "Tabla", "Table")}</caption>
              <thead>
                <tr><th className="n">#</th><th>{t(lang, "Equipo", "Team")}</th><th className="n">PJ</th><th className="n">Pts</th></tr>
              </thead>
              <tbody>
                {f.table!.rows!.filter((r) => (r.group ?? "") === g).map((r) => (
                  <tr key={r.team}><td className="n">{r.rank}</td><td>{r.team}</td><td className="n">{r.played}</td><td className="n">{r.points}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </main>
      <TabBar current="futbol" lang={lang} />
    </>
  );
}
