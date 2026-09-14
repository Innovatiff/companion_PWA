/**
 * Lotería: official draw results from the last two days, for games whose
 * parser is confirmed. Results only: never odds, predictions, "hot numbers" or
 * a link to buy. Every result shows its draw date and when we verified it.
 */
import Head from "next/head";
import type { GetServerSideProps } from "next";
import { formatDate, formatTime12, formatWeekdayDate, localDate } from "@leamington/shared/src/format.ts";
import { db } from "../../lib/db";
import { loadClient, recordView } from "../../lib/client";
import { t } from "../../lib/t";
import { PageHead, TabBar } from "../../lib/frame";
import { Balls, Pic, drawTime } from "../../lib/ui";

export const config = { unstable_runtimeJS: false };

type Draw = {
  draw_date: string; draw_time: string | null; numbers: string[]; extras: Record<string, unknown> | null;
  verified_at: string; source_url: string;
};
type Game = { game: string; operator: string; draws: Draw[] };
type Props = { lang: "es" | "en"; tz: string; games: Game[] };

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const loaded = await loadClient(ctx);
  if ("redirect" in loaded) return loaded;
  const { rows } = await db().query("select app.lottery_page($1) as l", [loaded.client.id]);
  const games = (rows[0]?.l?.games ?? []) as Game[];
  await recordView(loaded.client.id, "loteria", { games: games.length, draws: games.reduce((n, g) => n + g.draws.length, 0) });
  return { props: { lang: loaded.client.language, tz: loaded.client.timezone, games } };
};

function extras(value: Record<string, unknown> | null): string {
  if (!value) return "";
  return Object.entries(value)
    .filter(([, v]) => v != null && typeof v !== "object")
    .map(([k, v]) => `${k}: ${v}`)
    .join(" · ");
}

export default function Loteria({ lang, tz, games }: Props) {
  return (
    <>
      <Head>
        <title>{`${t(lang, "Lotería", "Lottery")} · Hoy`}</title>
        <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
      </Head>
      <main>
        <PageHead lang={lang} title={t(lang, "Lotería", "Lottery")} art="lottery" back />
        <p className="step">{t(lang, "Resultados oficiales · últimos 2 días", "Official results · last 2 days")}</p>
        {games.map((g) => (
          <section key={g.game}>
            <h2>{g.game}</h2>
            {g.draws.map((d) => (
              <div className="tile lottery" key={d.draw_date + (d.draw_time ?? "")}>
                <Pic name="lottery" lazy />
                <span>
                  <small>{formatWeekdayDate(d.draw_date, lang)}{d.draw_time ? ` · ${drawTime(d.draw_time)}` : ""}</small>
                  <Balls numbers={d.numbers} />
                  {extras(d.extras) && <small>{extras(d.extras)}</small>}
                  <small>
                    {t(lang, "Verificado", "Verified")}: {formatDate(localDate(d.verified_at, tz), lang)}, {formatTime12(d.verified_at, tz)}
                    {" · "}<a href={d.source_url} rel="noopener">{g.operator}</a>
                  </small>
                </span>
              </div>
            ))}
          </section>
        ))}
      </main>
      <TabBar current="mas" lang={lang} />
    </>
  );
}
