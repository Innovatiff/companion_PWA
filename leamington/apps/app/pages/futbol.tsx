/**
 * Fútbol: their team's next matches and recent results, their league today,
 * and the table only where current-season standings exist (0015).
 *
 * Schedules show only while the fixtures feed is current; results are final
 * and show at any age, with their date. Never a live score: we do not poll
 * live. An empty list renders nothing, never "no matches". Crests come from our
 * own domain when stored (0033); otherwise the team's initials.
 */
import Head from "next/head";
import type { GetServerSideProps } from "next";
import { TabBar } from "@leamington/shared/src/ui/TabBar.tsx";
import { formatTime12, formatWeekdayDate, localDate } from "@leamington/shared/src/format.ts";
import { db } from "../lib/db";
import { loadClient, recordView } from "../lib/client";
import { t } from "../lib/t";
import { Crest } from "../lib/ui";
import { FUTBOL_CSS } from "../lib/page-css";

export const config = { unstable_runtimeJS: false };

type Match = {
  kickoff: string; status?: string; home: string; away: string; is_today?: boolean;
  home_id?: number; away_id?: number; home_crest?: boolean; away_crest?: boolean;
  home_score?: number | null; away_score?: number | null;
};
type Standing = { group: string | null; rank: number; team: string; points: number; played: number };
type Football = {
  language: "es" | "en"; timezone: string; team: string | null; team_id?: number; team_crest?: boolean;
  league?: string; fixtures_current: boolean;
  upcoming?: Match[] | null; results?: Match[]; league_today?: Match[] | null;
  table?: { state: string; reason: string | null; rows: Standing[] | null } | null;
};

export const getServerSideProps: GetServerSideProps<{ f: Football }> = async (ctx) => {
  const loaded = await loadClient(ctx);
  if ("redirect" in loaded) return loaded;
  const { rows } = await db().query("select app.football_page($1) as f", [loaded.client.id]);
  const f = rows[0]?.f as Football;
  await recordView(loaded.client.id, "futbol", {
    team: Boolean(f.team), fixtures_current: f.fixtures_current,
    upcoming: f.upcoming?.length ?? null, results: f.results?.length ?? 0,
    league_today: f.league_today?.length ?? null,
    table: f.table?.state ?? null, table_reason: f.table?.reason ?? null,
  });
  return { props: { f } };
};

const STATUS: Record<string, [string, string]> = {
  live: ["en juego", "playing now"],
  postponed: ["aplazado", "postponed"],
  cancelled: ["cancelado", "cancelled"],
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function Futbol({ f }: { f: Football }) {
  const lang = f.language;
  const tz = f.timezone;
  const day = (m: Match) => cap(formatWeekdayDate(localDate(m.kickoff, tz), lang));
  const status = (m: Match) => (m.status && STATUS[m.status] ? ` · ${STATUS[m.status][lang === "en" ? 1 : 0]}` : "");
  const finished = (m: Match) => m.home_score != null && m.away_score != null;

  // One match: both teams with crest or initials, and the kickoff chip or the final score between them.
  const card = (m: Match, head: string) => (
    <div className="card match" key={m.kickoff + m.home}>
      <small>{head}</small>
      <span><Crest id={m.home_id} name={m.home} has={m.home_crest} size={44} />{m.home}</span>
      {finished(m)
        ? <b className="score">{m.home_score}–{m.away_score}</b>
        : <b className="chip">{m.is_today ? `${t(lang, "Hoy", "Today")} · ` : ""}{formatTime12(m.kickoff, tz)}</b>}
      <span><Crest id={m.away_id} name={m.away} has={m.away_crest} size={44} />{m.away}</span>
    </div>
  );
  const groups = f.table?.state === "available" && f.table.rows
    ? [...new Set(f.table.rows.map((r) => r.group ?? ""))] : [];

  return (
    <>
      <Head>
        <title>{`Fútbol · Hoy`}</title>
        <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
        <style dangerouslySetInnerHTML={{ __html: FUTBOL_CSS }} />
      </Head>
      <main>
        {f.team ? (
          <section className="card team">
            <Crest id={f.team_id} name={f.team} has={f.team_crest} size={72} />
            <div>
              <h1>{f.team}</h1>
              {f.league && <p className="step">{f.league}</p>}
            </div>
          </section>
        ) : (
          <h1>{t(lang, "Fútbol", "Football")}</h1>
        )}

        {f.upcoming && f.upcoming.length > 0 && (
          <>
            <h2>{t(lang, "Próximos partidos", "Next matches")}</h2>
            {f.upcoming.map((m) => card(m, day(m) + status(m)))}
          </>
        )}

        {f.results && f.results.length > 0 && (
          <>
            <h2>{t(lang, "Resultados", "Results")}</h2>
            {f.results.map((m) => card(m, `${day(m)} · ${t(lang, "Final", "Full time")}`))}
          </>
        )}

        {f.league_today && f.league_today.length > 0 && (
          <>
            <h2>{t(lang, "Hoy en la liga", "In the league today")}</h2>
            {f.league_today.map((m) => card({ ...m, is_today: false },
              m.status === "finished" && finished(m) ? t(lang, "Final", "Full time") : `${f.league ?? ""}${status(m)}`))}
          </>
        )}

        {groups.map((g) => (
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
