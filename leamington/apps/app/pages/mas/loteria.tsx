/**
 * Lotería (CLAUDE.md, binding: official RESULTS only; never odds, predictions,
 * "hot numbers", prizes or a link to buy; every result with its draw date and
 * when we verified it).
 *
 *   ¿Salió mi número? (0045): for each game of their country with a verified
 *   pick format, a small GET form; their numbers against the official results
 *   of the last 7 days (app.lottery_check). It says how many numbers match and
 *   which, never "ganaste". A game whose results are not up to date is not
 *   compared; a refusal (wrong count or range) says what the game takes.
 *
 *   Below, as before: the official results of the last two days.
 */
import Head from "next/head";
import type { GetServerSideProps } from "next";
import { formatDate, formatTime12, formatWeekdayDate, localDate } from "@leamington/shared/src/format.ts";
import { db } from "../../lib/db";
import { loadClient, recordView } from "../../lib/client";
import { t } from "../../lib/t";
import { PageHead, TabBar } from "../../lib/frame";
import { Balls, Pic, drawTime } from "../../lib/ui";
import { DrawCheck, inputsFor, refusalText, shown, type Check, type CheckableGame } from "../../lib/lottery";
import { LOTERIA_CSS } from "../../lib/page-css";

export const config = { unstable_runtimeJS: false };

type Draw = {
  draw_date: string; draw_time: string | null; numbers: string[]; extras: Record<string, unknown> | null;
  verified_at: string; source_url: string;
};
type Game = { game: string; operator: string; draws: Draw[] };
type Props = {
  lang: "es" | "en"; tz: string; games: Game[]; checkable: CheckableGame[];
  checkFor: number | null; entered: string[]; check: Check | null; bad: boolean;
};

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const loaded = await loadClient(ctx);
  if ("redirect" in loaded) return loaded;
  const { client } = loaded;
  const [page, games] = await Promise.all([
    db().query("select app.lottery_page($1) as l", [client.id]),
    db().query("select app.lottery_checkable_games($1) as g", [client.id]),
  ]);
  const checkable = (games.rows[0]?.g ?? []) as CheckableGame[];
  const game = checkable.find((g) => g.game_id === Number(ctx.query.g));
  const entered = game ? ([] as string[]).concat(ctx.query.n ?? []).map((s) => String(s).trim()).filter(Boolean).slice(0, 10) : [];
  let check: Check | null = null;
  let bad = false;
  if (game && entered.length > 0) {
    if (entered.every((s) => /^\d{1,6}$/.test(s))) {
      check = (await db().query("select app.lottery_check($1, $2, $3::int[]) as c", [client.id, game.game_id, entered.map(Number)])).rows[0]?.c ?? null;
    } else {
      bad = true;
    }
  }
  const results = (page.rows[0]?.l?.games ?? []) as Game[];
  await recordView(client.id, "loteria", {
    games: results.length, draws: results.reduce((n, g) => n + g.draws.length, 0), checkable: checkable.length,
    check: game ? (check ? (check.error ?? check.state) : bad ? "bad_input" : null) : null,
  });
  return {
    props: { lang: client.language, tz: client.timezone, games: results, checkable, checkFor: game?.game_id ?? null, entered, check, bad },
  };
};

function extras(value: Record<string, unknown> | null): string {
  if (!value) return "";
  return Object.entries(value)
    .filter(([, v]) => v != null && typeof v !== "object")
    .map(([k, v]) => `${k}: ${v}`)
    .join(" · ");
}

export default function Loteria({ lang, tz, games, checkable, checkFor, entered, check, bad }: Props) {
  return (
    <>
      <Head>
        <title>{`${t(lang, "Lotería", "Lottery")} · Hoy`}</title>
        <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
        <style dangerouslySetInnerHTML={{ __html: LOTERIA_CSS }} />
      </Head>
      <main>
        <PageHead lang={lang} title={t(lang, "Lotería", "Lottery")} art="lottery" back />

        {checkable.length > 0 && <div className="sh"><h2>{t(lang, "¿Salió mi número?", "Did my number come up?")}</h2></div>}
        {checkable.map((g) => {
          const mine = checkFor === g.game_id;
          const wide = g.max >= 1000;
          const width = String(g.max).length;
          const count = g.pick_min === g.pick_max ? String(g.pick_min) : t(lang, `${g.pick_min} a ${g.pick_max}`, `${g.pick_min} to ${g.pick_max}`);
          const kind = g.match === "digits" ? t(lang, "dígitos", "digits") : g.pick_max === 1 ? t(lang, "número", "number") : t(lang, "números", "numbers");
          return (
            <section key={g.game_id} className="card lot" id={`g${g.game_id}`} data-game={g.game_id}>
              <div className="ch">
                <Pic name="lottery" lazy />
                <span><b className="gname">{g.game}</b><small>{g.operator}</small></span>
              </div>
              <form method="get" action={`/mas/loteria#g${g.game_id}`} className={wide ? "picks wide" : "picks"}>
                <input type="hidden" name="g" value={g.game_id} />
                {Array.from({ length: inputsFor(g) }, (_, i) => (
                  <input key={i} name="n" type="text" inputMode="numeric" maxLength={width} pattern={wide ? `\\d{${width}}` : `\\d{1,${width}}`}
                         required={i < g.pick_min} aria-label={t(lang, `Número ${i + 1}`, `Number ${i + 1}`)}
                         placeholder={wide ? "0".repeat(width) : ""} defaultValue={mine ? entered[i] ?? "" : ""} />
                ))}
                <button type="submit">{t(lang, "Revisar", "Check")}</button>
              </form>
              <small>{`${count} ${kind} · ${shown(g.min, g)}–${shown(g.max, g)}`}</small>

              {mine && bad && <p className="err" role="alert">{t(lang, "Escribe solo números.", "Enter numbers only.")}</p>}
              {mine && check && (
                check.error ? (
                  <p className="err" role="alert">{refusalText(check, g, lang)}</p>
                ) : check.state === "stale" ? (
                  <p className="stale">
                    {check.newest_draw_date
                      ? t(lang, `Los resultados de ${g.game} no están al día (el último es del ${formatDate(check.newest_draw_date, lang)}). No comparamos tus números.`,
                               `${g.game} results are not up to date (the latest is from ${formatDate(check.newest_draw_date, lang)}). We do not compare your numbers.`)
                      : t(lang, `Los resultados de ${g.game} no están al día. No comparamos tus números.`,
                               `${g.game} results are not up to date. We do not compare your numbers.`)}
                  </p>
                ) : (
                  <>
                    <p className="mine">{t(lang, "Tus números: ", "Your numbers: ")}<b>{check.numbers.map((n) => shown(n, g)).join(" · ")}</b></p>
                    {(check.draws ?? []).map((d) => <DrawCheck key={`${d.draw_date}${d.draw_time ?? ""}`} d={d} c={check} g={g} lang={lang} tz={tz} />)}
                  </>
                )
              )}
            </section>
          );
        })}

        {games.length > 0 && <div className="sh"><h2>{t(lang, "Resultados oficiales · últimos 2 días", "Official results · last 2 days")}</h2></div>}
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
