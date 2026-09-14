/**
 * Tu semana (0045, app.week_summary): the member's Monday-to-Sunday week from
 * real rows only, after the reference's Analytics screen. The days they opened
 * Hoy as seven circles; the reference rate's week; then, each only when there is
 * something real: badges earned, holidays ahead, the latest official lottery
 * results, their team's results, and Leamington's forecast highest and lowest
 * (labelled a forecast). Everything carries a day's validity.
 *
 * Early in the week: with fewer than 3 stored rate days this week (or none), the
 * rate card is the last 7 stored days instead (app.fx_history), titled as such
 * and never as this week. With no official result this week, the latest result
 * of each game from the lotería page (app.lottery_page), only for games whose
 * results are current (app.lottery_game_current). No data: no part.
 */
import Head from "next/head";
import type { GetServerSideProps } from "next";
import { formatDate, formatTime12, formatWeekdayDate, localDate } from "@leamington/shared/src/format.ts";
import { db } from "../../lib/db";
import { loadClient, recordView } from "../../lib/client";
import { t } from "../../lib/t";
import { OfflineBar, PageHead, TabBar } from "../../lib/frame";
import { EXPIRE_SCRIPT } from "../../lib/open-script";
import { Art, Balls, Crest, DateBlock, FLAG, drawTime, localDayEnd } from "../../lib/ui";
import { badgeName } from "../../lib/member";
import { RateChart, WeekCircles, num, rateText, shortDate, type FxHistory, type WeekPoint } from "../../lib/money";
import { ExtraBalls, type Extras } from "../../lib/lottery";
import { SEMANA_CSS } from "../../lib/page-css";

export const config = { unstable_runtimeJS: false };

type Point = { date: string; rate: number };
type Match = { id: number; home: string; away: string; home_id: number; away_id: number; home_crest: boolean; away_crest: boolean;
  home_score?: number; away_score?: number; kickoff: string };
type Week = {
  language: "es" | "en"; timezone: string; week_start: string; week_end: string; today: string;
  opened: { days: number; weekdays: (boolean | null)[] } | null;
  rate: { currency: string; note: string; points: WeekPoint[]; high: Point; low: Point; latest: Point; current: boolean;
    last_week: Point | null; change: number | null; change_pct: number | null } | null;
  team: { team: string | null; results: Match[] | null; next: Match | null } | null;
  lottery: { game_id: number; game: string; operator: string; draw_date: string; draw_time: string | null; numbers: string[]; verified_at: string; source_url: string }[] | null;
  holidays_ahead: { date: string; name: string; where: string; days_left: number; verified_at: string }[] | null;
  badges: { key: string; earned_at: string }[] | null;
  weather: { place: string; label: string; from: string; to: string; days: number; highest: { date: string; temp_max: number }; lowest: { date: string; temp_max: number } } | null;
  generated_at: string;
};
type LatestDraw = { game: string; operator: string; draw_date: string; draw_time: string | null; numbers: string[]; extras: Extras; verified_at: string; source_url: string };
type Props = { lang: "es" | "en"; w: Week; tz: string; country: string; fx7: FxHistory | null; lotLatest: LatestDraw[] | null };

/** The week's own rate card needs at least 3 stored days this week. */
const weekRate = (w: Week) => (w.rate && w.rate.points.length >= 3 ? w.rate : null);

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const loaded = await loadClient(ctx);
  if ("redirect" in loaded) return loaded;
  const { client } = loaded;
  const { rows } = await db().query("select app.week_summary($1) as w", [client.id]);
  const w = rows[0]?.w as Week;
  const [fxRow, lotRow] = await Promise.all([
    weekRate(w) ? null : db().query("select app.fx_history($1, 7) as h", [client.id]),
    w.lottery ? null : db().query(
      `select app.lottery_page(c.id) as l,
              coalesce((select jsonb_agg(g.name) from lottery_games g
                         where g.country = c.country and g.active and app.lottery_game_current(g.id, now()) is false), '[]'::jsonb) as stale
         from clients c where c.id = $1`, [client.id]),
  ]);
  const fx = (fxRow?.rows[0]?.h ?? null) as FxHistory | null;
  const fx7 = fx?.latest && fx.points.length > 0 ? fx : null;
  const stale = new Set<string>(lotRow?.rows[0]?.stale ?? []);
  const lotLatest = lotRow
    ? ((lotRow.rows[0]?.l?.games ?? []) as { game: string; operator: string; draws: Omit<LatestDraw, "game" | "operator">[] }[])
        .filter((g) => g.draws.length > 0 && !stale.has(g.game)).map((g) => ({ game: g.game, operator: g.operator, ...g.draws[0] }))
    : null;
  await recordView(client.id, "semana", {
    opened: w.opened?.days ?? null, rate: Boolean(weekRate(w)), rate7: Boolean(fx7), team: Boolean(w.team), lottery: w.lottery?.length ?? null,
    lottery_latest: lotLatest?.length ?? null, holidays: w.holidays_ahead?.length ?? null, badges: w.badges?.length ?? null, weather: Boolean(w.weather),
  });
  return { props: { lang: client.language, w, tz: client.timezone, country: client.country, fx7, lotLatest } };
};

const WEEKDAYS = { es: ["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"], en: ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"] };

/** "Semana del 14 al 20 de septiembre" (or across months: "del 28 de septiembre al 4 de octubre"). */
function weekTitle(start: string, end: string, lang: "es" | "en") {
  const sameMonth = start.slice(0, 7) === end.slice(0, 7);
  if (lang === "en") return `Week of ${sameMonth ? Number(start.slice(8)) : formatDate(start, lang)} to ${formatDate(end, lang)}`;
  return `Semana del ${sameMonth ? Number(start.slice(8)) : formatDate(start, lang)} al ${formatDate(end, lang)}`;
}

/** The week's opened days: filled, outlined for a past day not opened, dashed for days to come. */
export function OpenedCircles({ weekdays, lang }: { weekdays: (boolean | null)[]; lang: "es" | "en" }) {
  return (
    <ol className="wkc">
      {weekdays.map((v, i) => (
        <li key={i} className={`wc ${v === true ? "up" : v === false ? "no" : "nd"}`} data-open={v === null ? "" : String(v)}>
          <small>{WEEKDAYS[lang][i]}</small>
          <span className="o" aria-hidden="true">{v === true ? "✓" : ""}</span>
          <span className="sr">{v === true ? t(lang, "abriste", "opened") : v === false ? t(lang, "no abriste", "not opened") : t(lang, "por venir", "to come")}</span>
        </li>
      ))}
    </ol>
  );
}

export default function Semana({ lang, w, tz, country, fx7, lotLatest }: Props) {
  const until = localDayEnd(new Date(w.generated_at), tz);
  const rate = weekRate(w);
  const from7 = fx7?.points[0]?.date;
  const chart = rate ? ({ currency: rate.currency, days: 7, note: rate.note, current: rate.current, latest: { ...rate.latest, stale: !rate.current },
    valid_until: null, points: rate.points, high: rate.high, low: rate.low, change_pct: rate.change_pct, days_up: null, days_down: null,
    week: rate.points, language: lang } as FxHistory) : null;
  const soon = (n: number) => (n === 0 ? t(lang, "Hoy", "Today") : n === 1 ? t(lang, "Mañana", "Tomorrow") : t(lang, `En ${n} días`, `In ${n} days`));
  return (
    <>
      <Head>
        <title>{`${t(lang, "Tu semana", "Your week")} · Hoy`}</title>
        <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
        <style dangerouslySetInnerHTML={{ __html: SEMANA_CSS }} />
      </Head>
      <main>
        <OfflineBar at={w.generated_at} tz={tz} lang={lang} />
        <PageHead lang={lang} title={t(lang, "Tu semana", "Your week")} art="week" back />
        <p className="wtitle">{weekTitle(w.week_start, w.week_end, lang)}</p>

        {w.opened && (
          <section className="card" data-part="opened" data-line="opened" data-until={until}>
            <OpenedCircles weekdays={w.opened.weekdays} lang={lang} />
            <p className="big1"><b>{w.opened.days}</b>{t(lang, `Abriste Hoy ${w.opened.days === 1 ? "1 día" : `${w.opened.days} días`}`, `You opened Hoy on ${w.opened.days} ${w.opened.days === 1 ? "day" : "days"}`)}</p>
          </section>
        )}

        {rate && chart && (
          <section className="card chartc" data-part="rate" data-line="rate" data-until={until}>
            <div className="ch"><Art name="money" size={40} lazy /><h2>{t(lang, "Tasa de referencia", "Reference rate")}</h2></div>
            <p className="rt"><b>{rateText(rate.latest.rate)}</b><span>{rate.currency}</span><small>{shortDate(rate.latest.date, lang)}</small></p>
            {!rate.current && <p className="stale">{t(lang, `Es la tasa de referencia del ${formatDate(rate.latest.date, lang)}. No es la de hoy.`, `This is the reference rate of ${formatDate(rate.latest.date, lang)}. It is not today's.`)}</p>}
            <RateChart h={chart} lang={lang} />
            <p className="hilo">
              <span className="hi" data-d={rate.high.date}><small>{t(lang, "Más alta", "Highest")}</small><b>{rateText(rate.high.rate)}</b><small>{shortDate(rate.high.date, lang)}</small></span>
              <span className="lo" data-d={rate.low.date}><small>{t(lang, "Más baja", "Lowest")}</small><b>{rateText(rate.low.rate)}</b><small>{shortDate(rate.low.date, lang)}</small></span>
            </p>
            {rate.change_pct != null && rate.last_week && (
              <span className="chg" data-pct={rate.change_pct}>
                {`${rate.change_pct > 0 ? "+" : ""}${num(rate.change_pct, 2, lang)}% ${t(lang, `desde el ${shortDate(rate.last_week.date, lang)}`, `since ${shortDate(rate.last_week.date, lang)}`)}`}
              </span>
            )}
          </section>
        )}

        {!rate && fx7?.latest && from7 && (
          <section className="card" data-part="rate7" data-line="rate" data-until={until}>
            <div className="ch"><Art name="money" size={40} lazy /><h2>{t(lang, "Tasa · últimos 7 días", "Rate · last 7 days")}</h2></div>
            <small className="rng" data-from={from7} data-to={fx7.latest.date}>
              {t(lang, `Del ${shortDate(from7, lang)} al ${shortDate(fx7.latest.date, lang)} · tasa de referencia`, `${shortDate(from7, lang)} to ${shortDate(fx7.latest.date, lang)} · reference rate`)}
            </small>
            <p className="rt"><b>{rateText(fx7.latest.rate)}</b><span>{fx7.currency}</span><small>{shortDate(fx7.latest.date, lang)}</small></p>
            {fx7.latest.stale && <p className="stale">{t(lang, `Es la tasa de referencia del ${formatDate(fx7.latest.date, lang)}. No es la de hoy.`, `This is the reference rate of ${formatDate(fx7.latest.date, lang)}. It is not today's.`)}</p>}
            <WeekCircles week={fx7.week.filter((p) => p.date >= from7)} lang={lang} />
            {fx7.high && fx7.low && (
              <p className="hilo">
                <span className="hi" data-d={fx7.high.date}><small>{t(lang, "Más alta", "Highest")}</small><b>{rateText(fx7.high.rate)}</b><small>{shortDate(fx7.high.date, lang)}</small></span>
                <span className="lo" data-d={fx7.low.date}><small>{t(lang, "Más baja", "Lowest")}</small><b>{rateText(fx7.low.rate)}</b><small>{shortDate(fx7.low.date, lang)}</small></span>
              </p>
            )}
            {fx7.change_pct != null && (
              <span className="chg" data-pct={fx7.change_pct}>
                {`${fx7.change_pct > 0 ? "+" : ""}${num(fx7.change_pct, 2, lang)}% ${t(lang, `desde el ${shortDate(from7, lang)}`, `since ${shortDate(from7, lang)}`)}`}
              </span>
            )}
          </section>
        )}

        {w.badges && w.badges.length > 0 && (
          <section className="card" data-part="badges" data-line="badges" data-until={until}>
            <h2>{t(lang, "Insignias de esta semana", "Badges this week")}</h2>
            <ul className="bw">
              {w.badges.map((b) => (
                <li key={b.key} data-key={b.key}>
                  <Art name={`badge-${b.key}` as Parameters<typeof Art>[0]["name"]} size={56} lazy />
                  <b>{badgeName(b.key, lang)}</b>
                  <small>{shortDate(b.earned_at, lang)}</small>
                </li>
              ))}
            </ul>
          </section>
        )}

        {w.holidays_ahead && w.holidays_ahead.length > 0 && (
          <section data-part="holidays" data-line="holidays" data-until={until}>
            <h2>{t(lang, "Feriados que vienen", "Holidays ahead")}</h2>
            {w.holidays_ahead.map((h) => (
              <div key={h.date + h.where + h.name} className="tile hol" data-where={h.where} data-d={h.date}>
                <DateBlock date={h.date} lang={lang} />
                <span>
                  <small>{`${h.where === "ON" ? `${FLAG.CA} Ontario` : FLAG[h.where] ?? ""} · ${formatWeekdayDate(h.date, lang).split(" ")[0]}`}</small>
                  <p className="line">{h.name}</p>
                  <small><span className="chip">{soon(h.days_left)}</span>{` ${t(lang, "Verificado", "Verified")}: ${formatDate(h.verified_at, lang)}`}</small>
                </span>
              </div>
            ))}
          </section>
        )}

        {w.lottery && w.lottery.length > 0 && (
          <section data-part="lottery" data-line="lottery" data-until={until}>
            <h2>{t(lang, "Lotería: últimos resultados oficiales", "Lottery: latest official results")}</h2>
            {w.lottery.map((l) => (
              <div key={l.game_id} className="tile lottery" data-game={l.game_id}>
                <span>
                  <small>{`${l.game} · ${formatDate(l.draw_date, lang)}${l.draw_time ? ` · ${drawTime(l.draw_time)}` : ""}`}</small>
                  <Balls numbers={l.numbers} />
                  <small>
                    {`${t(lang, "Verificado", "Verified")}: ${formatDate(localDate(l.verified_at, tz), lang)}, ${formatTime12(l.verified_at, tz)} · `}
                    <a href={l.source_url} rel="noopener">{l.operator}</a>
                  </small>
                </span>
              </div>
            ))}
          </section>
        )}

        {!w.lottery && lotLatest && lotLatest.length > 0 && (
          <section data-part="lottery-latest" data-line="lottery" data-until={until}>
            <h2>{t(lang, "Lotería · últimos resultados", "Lottery · latest results")}</h2>
            {lotLatest.map((l) => (
              <div key={l.game} className="tile lottery" data-game={l.game} data-draw={`${l.draw_date} ${l.draw_time ?? ""}`.trim()}>
                <span>
                  <small>{`${l.game} · ${formatDate(l.draw_date, lang)}${l.draw_time ? ` · ${drawTime(l.draw_time)}` : ""}`}</small>
                  <span className="brow"><Balls numbers={l.numbers} /><ExtraBalls x={l.extras} /></span>
                  <small>
                    {`${t(lang, "Verificado", "Verified")}: ${formatDate(localDate(l.verified_at, tz), lang)}, ${formatTime12(l.verified_at, tz)} · `}
                    <a href={l.source_url} rel="noopener">{l.operator}</a>
                  </small>
                </span>
              </div>
            ))}
          </section>
        )}

        {w.team && (
          <section className="card" data-part="team" data-line="team" data-until={until}>
            <div className="ch"><Art name="football" size={40} lazy /><h2>{w.team.team ?? t(lang, "Tu equipo", "Your team")}</h2></div>
            {(w.team.results ?? []).map((m) => (
              <p key={m.id} className="res2" data-date={localDate(m.kickoff, tz)}>
                <small className="rd">{formatWeekdayDate(localDate(m.kickoff, tz), lang)}</small>
                <span><Crest id={m.home_id} name={m.home} has={m.home_crest} size={28} />{m.home}</span>
                <b className="sc">{`${m.home_score}–${m.away_score}`}</b>
                <span>{m.away}<Crest id={m.away_id} name={m.away} has={m.away_crest} size={28} /></span>
              </p>
            ))}
            {w.team.next && (
              <p className="nx2">{t(lang, "Próximo: ", "Next: ")}<b>{`${w.team.next.home} – ${w.team.next.away}`}</b>
                {` · ${formatWeekdayDate(localDate(w.team.next.kickoff, tz), lang).split(" ")[0]} ${formatTime12(w.team.next.kickoff, tz)}`}</p>
            )}
          </section>
        )}

        {w.weather && (
          <section className="card" data-part="weather" data-kind="forecast" data-line="weather" data-until={until}>
            <div className="ch"><Art name="partly-day" size={40} lazy /><h2>{`${w.weather.place} · ${w.weather.label}`}</h2></div>
            <p className="hilo">
              <span className="hi" data-t={w.weather.highest.temp_max}><small>{t(lang, "Lo más alto", "Highest")}</small><b>{`${w.weather.highest.temp_max}°`}</b><small>{shortDate(w.weather.highest.date, lang)}</small></span>
              <span className="lo" data-t={w.weather.lowest.temp_max}><small>{t(lang, "Lo más bajo", "Lowest")}</small><b>{`${w.weather.lowest.temp_max}°`}</b><small>{shortDate(w.weather.lowest.date, lang)}</small></span>
            </p>
            <small>{t(lang, `Máximas del pronóstico, ${shortDate(w.weather.from, lang)} a ${shortDate(w.weather.to, lang)}`, `Forecast highs, ${shortDate(w.weather.from, lang)} to ${shortDate(w.weather.to, lang)}`)}</small>
          </section>
        )}
        <a className="prompt" href="/noticias">{t(lang, "Noticias de tu país y tu municipio →", "News from home →")}</a>
        <p className="flag-note" hidden>{country}</p>
      </main>
      <TabBar current="mas" lang={lang} />
      <script dangerouslySetInnerHTML={{ __html: EXPIRE_SCRIPT }} />
    </>
  );
}
