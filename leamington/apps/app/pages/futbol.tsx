/**
 * Fútbol: their team's next matches and recent results, their league today,
 * and the table only where current-season standings exist (0015).
 *
 * Schedules show only while the fixtures feed is current; results are final
 * and show at any age, with their date. Never a live score: we do not poll
 * live. An empty list renders nothing, never "no matches".
 */
import Head from "next/head";
import type { GetServerSideProps } from "next";
import { TabBar } from "@leamington/shared/src/ui/TabBar.tsx";
import { formatTime12, formatWeekdayDate, localDate } from "@leamington/shared/src/format.ts";
import { db } from "../lib/db";
import { loadClient, recordView } from "../lib/client";
import { t } from "../lib/t";

export const config = { unstable_runtimeJS: false };

type Match = {
  kickoff: string; status?: string; home: string; away: string; is_today?: boolean;
  home_score?: number | null; away_score?: number | null;
};
type Standing = { group: string | null; rank: number; team: string; points: number; played: number };
type Football = {
  language: "es" | "en"; timezone: string; team: string | null; league?: string; fixtures_current: boolean;
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

export default function Futbol({ f }: { f: Football }) {
  const lang = f.language;
  const tz = f.timezone;
  const when = (m: Match) =>
    `${m.is_today ? t(lang, "Hoy", "Today") : formatWeekdayDate(localDate(m.kickoff, tz), lang)} · ${formatTime12(m.kickoff, tz)}`;
  const status = (m: Match) => (m.status && STATUS[m.status] ? ` · ${STATUS[m.status][lang === "en" ? 1 : 0]}` : "");
  const score = (m: Match) => `${m.home} ${m.home_score}–${m.away_score} ${m.away}`;
  const groups = f.table?.state === "available" && f.table.rows
    ? [...new Set(f.table.rows.map((r) => r.group ?? ""))] : [];

  return (
    <>
      <Head>
        <title>{`Fútbol · Hoy`}</title>
        <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
      </Head>
      <main>
        <h1>{f.team ?? t(lang, "Fútbol", "Football")}</h1>
        {f.league && <p className="step">{f.league}</p>}

        {f.upcoming && f.upcoming.length > 0 && (
          <>
            <h2>{t(lang, "Próximos partidos", "Next matches")}</h2>
            <ul className="rows">
              {f.upcoming.map((m) => (
                <li key={m.kickoff + m.home}>
                  <small>{when(m)}{status(m)}</small><br />{m.home} vs {m.away}
                </li>
              ))}
            </ul>
          </>
        )}

        {f.results && f.results.length > 0 && (
          <>
            <h2>{t(lang, "Resultados", "Results")}</h2>
            <ul className="rows">
              {f.results.map((m) => (
                <li key={m.kickoff + m.home}>
                  <small>{formatWeekdayDate(localDate(m.kickoff, tz), lang)}</small><br />{score(m)}
                </li>
              ))}
            </ul>
          </>
        )}

        {f.league_today && f.league_today.length > 0 && (
          <>
            <h2>{t(lang, "Hoy en la liga", "In the league today")}</h2>
            <ul className="rows">
              {f.league_today.map((m) => (
                <li key={m.kickoff + m.home}>
                  {m.status === "finished" && m.home_score != null
                    ? score(m)
                    : <><small>{formatTime12(m.kickoff, tz)}{status(m)}</small><br />{m.home} vs {m.away}</>}
                </li>
              ))}
            </ul>
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
