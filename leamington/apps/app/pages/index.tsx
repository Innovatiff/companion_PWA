/**
 * Home: a morning message, not a dashboard.
 *
 *   Buenos días, {name}
 *   {team} juega hoy 7pm          only when a fixture exists
 *   {municipality}: 28°, lluvia   their home town
 *   1 CAD = 18.51 HNL ↑ (más alto en 12 días)
 *   Faltan 127 días               departure, or a settled user's next trip
 *
 * Every line comes from our Postgres via app.render_home, which decides what is
 * current enough to show. A line without current data is absent, never stale and
 * never a placeholder. If setup never reached the municipality, a single link
 * offers it at most once a day: never modal, never blocking. No client runtime
 * JS; one small inline script (see lib/open-script.ts).
 *
 * The greeting sits on a photo of their hometown when we hold one (0034), with
 * its credit. Below the message, in this order, each section only when its real
 * data exists and carrying its own expiry (data-line/data-until), so an offline
 * copy drops it: official warnings status, their team's next match and today's
 * league, their other towns' weather (app.home_more), "Útil para ti" quick
 * cards (app.home_extras), and reminders: plan, alerts on this phone, school.
 */
import Head from "next/head";
import type { GetServerSideProps } from "next";
import { TabBar } from "@leamington/shared/src/ui/TabBar.tsx";
import { formatCode } from "@leamington/shared/src/code.ts";
import { formatDate, formatTime12, formatWeekdayDate, localDate } from "@leamington/shared/src/format.ts";
import { db } from "../lib/db";
import { readSession, cookieValue, clearedCookie } from "../lib/session";
import { OPEN_SCRIPT } from "../lib/open-script";
import { recordView, type Access } from "../lib/client";
import { t } from "../lib/t";
import {
  Art, Balls, Credit, Crest, DateBlock, FLAG, Icon, TownPhoto, drawTime, greetingArt, localDayEnd, tel,
  type IconName, type Photo,
} from "../lib/ui";

export const config = { unstable_runtimeJS: false };

type Line = { key: string; text: string; valid_until: string; note?: string };
type Extras = {
  country: string; timezone: string;
  next_holiday: { date: string; name: string; days_until: number; verified_at: string; valid_until: string } | null;
  emergency: { label: string; number: string; verified_at: string } | null;
  consulate: { city: string; phone: string | null; verified_at: string } | null;
  lottery: { game: string; draw_date: string; draw_time: string | null; numbers: string[]; verified_at: string; valid_until: string } | null;
  team: { id: number; name: string; crest: boolean } | null;
};
type Match = {
  kickoff: string; status?: string; home: string; away: string; is_today?: boolean;
  home_id?: number; away_id?: number; home_crest?: boolean; away_crest?: boolean;
  home_score?: number | null; away_score?: number | null;
};
type Warning = { id: number; level: string; event: string | null; headline: string | null; area_desc: string | null; issued_at: string | null };
type More = {
  home_photo: Photo | null; home_town: string | null;
  next_match: Match | null; league: string | null; league_today: Match[] | null; football_valid_until: string | null;
  watch_weather: { id: number; name: string; photo: boolean; today: { temp: string; rain: boolean } }[] | null;
  weather_valid_until: string | null;
  alerts: { state: "current" | "stale"; checked_at: string | null; valid_until: string | null; agency: string | null; agency_url: string | null; here: Warning[] | null } | null;
  plan: { period_end: string; days_left: number; status: "active" | "due" } | null;
  push_subscriptions: number;
  school_next: { event_name: string; start_date: string; end_date: string | null; verified_at: string } | null;
};
type Expired = { language: "es" | "en"; access: Access };
type Here = { name: string; d: { temp: string; low: number | null; rain: boolean; rain_prob?: number | null } };
type Props =
  | {
      renderId: string; renderedAt: string; language: "es" | "en"; lines: Line[]; prompt: string | null;
      extras: Extras | null; more: More | null; watchPhotos: Photo[]; pushReady: boolean; here: Here | null; expired?: undefined;
    }
  | { expired: Expired };

export const getServerSideProps: GetServerSideProps<Props> = async ({ req, res }) => {
  res.setHeader("Cache-Control", "private, no-cache");
  const clientId = readSession(cookieValue(req.headers.cookie));
  if (!clientId) return { redirect: { destination: "/login", permanent: false } };

  // No paid period covering today: the expiry screen instead of the morning message.
  const access = await db().query(
    "select language, app.client_access(id) as access from clients where id = $1 and active", [clientId]);
  const a = access.rows[0];
  if (a?.access && !a.access.paid) {
    (req as { appLang?: string }).appLang = a.language;
    await recordView(clientId, "expiry", { status: a.access.status, period_end: a.access.period_end });
    return { props: { expired: { language: a.language, access: a.access } } };
  }

  const [home, extras, moreRow, hereRow] = await Promise.all([
    db().query("select app.render_home($1) as m", [clientId]),
    db().query("select app.home_extras($1) as x", [clientId]),
    db().query("select app.home_more($1) as h", [clientId]),
    // Leamington today (0036), under the same two-provider rules as Clima.
    db().query(
      `select lp.name, app.local_forecast_summary(lp.id, (now() at time zone lp.timezone)::date, now(), c.language::text) as d
         from local_places lp, clients c
        where lp.key = 'leamington' and lp.active and c.id = $1`, [clientId]),
  ]);
  const m = home.rows[0]?.m;
  if (!m) {
    res.setHeader("Set-Cookie", clearedCookie);
    return { redirect: { destination: "/login?e=inactive", permanent: false } };
  }
  const more = (moreRow.rows[0]?.h ?? null) as More | null;
  // Credits for the watched towns that have a photo.
  const withPhoto = (more?.watch_weather ?? []).filter((w) => w.photo).map((w) => w.id);
  const watchPhotos: Photo[] = withPhoto.length
    ? (await db().query("select p from (select app.town_photo(id) as p from unnest($1::bigint[]) as id) s where p is not null", [withPhoto]))
        .rows.map((r) => r.p)
    : [];

  (req as { appLang?: string }).appLang = m.language;
  return {
    props: {
      renderId: m.render_id, renderedAt: m.rendered_at, language: m.language, lines: m.lines, prompt: m.prompt ?? null,
      extras: extras.rows[0]?.x ?? null, more, watchPhotos,
      here: hereRow.rows[0]?.d ? { name: hereRow.rows[0].name, d: hereRow.rows[0].d } : null,
      // The "turn on alerts" card only where this server can actually subscribe a phone.
      pushReady: Boolean(process.env.VAPID_PUBLIC_KEY?.trim()),
    },
  };
};

/**
 * The expiry screen: the paid period has ended. It says so, shows the code
 * large, names the affiliate who registered them, and says any Hoy affiliate
 * can reactivate it on the spot. Official weather warnings stay one tap away.
 */
function ExpiryScreen({ language: lang, access: a }: Expired) {
  return (
    <>
      <Head>
        <title>Hoy</title>
        <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
      </Head>
      <main data-lang={lang}>
        <header className="hello">
          <div>
            <h1>{a.status === "lapsed"
              ? t(lang, "Tu suscripción a Hoy terminó", "Your Hoy subscription has ended")
              : t(lang, "Tu cuenta de Hoy no tiene un periodo pagado", "Your Hoy account has no paid period")}</h1>
            {a.period_end && (
              <p>{t(lang, `Terminó el ${formatDate(a.period_end, lang, true)}.`, `It ended on ${formatDate(a.period_end, lang, true)}.`)}</p>
            )}
          </div>
          <span className="ico"><Icon name="clock" /></span>
        </header>
        <section className="card">
          <small>{t(lang, "Tu código", "Your code")}</small>
          <p className="code">{formatCode(a.code)}</p>
          <ol className="steps">
            <li><span className="n">1</span><span>{t(lang, "Cualquier afiliado de Hoy puede reactivarla: muéstrale este código.",
                                                           "Any Hoy affiliate can reactivate it: show them this code.")}</span></li>
            <li><span className="n">2</span><span>{t(lang, "Paga $20.00 por 6 meses.", "Pay $20.00 for 6 months.")}</span></li>
            <li><span className="n">3</span><span>{t(lang, "Funciona otra vez en ese momento.", "It works again right away.")}</span></li>
          </ol>
          <p className="inf">
            <span className="i"><Icon name="user" /></span>
            <small>
              {a.affiliate_is_house
                ? t(lang, "Te registró Hoy directamente.", "You were registered by Hoy directly.")
                : t(lang, `Te registró: ${a.affiliate_name}`, `Registered by: ${a.affiliate_name}`)}
            </small>
          </p>
        </section>
        <a className="tile" href="/clima">
          <span className="ico"><Icon name="alert" /></span>
          <span><p className="line">{t(lang, "Los avisos oficiales del clima siguen aquí", "Official weather warnings are still here")}</p></span>
        </a>
      </main>
    </>
  );
}

// Each home line as a card: an icon (or the team's crest), a small label, the
// sentence, and a link to its section. The card carries data-line/data-until, so
// the offline script removes the whole card when the line expires.
const TILE: Record<string, { href?: string; es: string; en: string; icon: IconName }> = {
  fixture: { href: "/futbol", es: "Fútbol", en: "Football", icon: "ball" },
  weather: { href: "/clima", es: "Clima", en: "Weather", icon: "sun" },
  rate: { href: "/mas/tasa", es: "Tasa de referencia", en: "Reference rate", icon: "swap" },
  countdown: { es: "Tu fecha", en: "Your date", icon: "calendar" },
};

const LEVEL: Record<string, [string, string]> = {
  red: ["Rojo", "Red"], orange: ["Naranja", "Orange"], yellow: ["Amarillo", "Yellow"], green: ["Verde", "Green"],
};
const STATUS: Record<string, [string, string]> = {
  live: ["en juego", "playing now"], postponed: ["aplazado", "postponed"], cancelled: ["cancelado", "cancelled"],
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const HOUR = 3_600_000;

export default function Home(props: Props) {
  if (props.expired) return <ExpiryScreen {...props.expired} />;
  const { renderId, renderedAt, language: lang, lines, prompt, extras: x, more: h, watchPhotos, pushReady, here } = props;
  const [greeting, ...rest] = lines;
  const tz = x?.timezone ?? "America/Toronto";
  const now = Date.parse(renderedAt);
  // Anything whose validity has already passed is not rendered at all.
  const live = (until: string | null | undefined): until is string => Boolean(until) && Date.parse(until!) > now;
  const today = localDate(renderedAt, tz);
  const dayEnd = localDayEnd(new Date(now), tz);
  // Leamington today: until local midnight, and no longer than the forecast window (3 hours).
  const hereUntil = new Date(Math.min(Date.parse(dayEnd), now + 3 * HOUR)).toISOString();
  const moment = (iso: string) =>
    localDate(iso, tz) === today ? formatTime12(iso, tz) : `${formatTime12(iso, tz)}, ${formatDate(localDate(iso, tz), lang)}`;
  const verified = (day: string) => `${t(lang, "Verificado", "Verified")}: ${formatDate(day, lang)}`;

  // Útil para ti (0033).
  const hol = x?.next_holiday ?? null;
  const sos = x?.emergency ?? null;
  const con = x?.consulate ?? null;
  const lot = x?.lottery && x.lottery.numbers.length > 0 ? x.lottery : null;
  // "en 2 días" is only true on the day it was rendered: it expires at local midnight.
  const holDayEnd = dayEnd;
  const soon = hol && (hol.days_until === 0 ? t(lang, "Hoy", "Today")
    : hol.days_until === 1 ? t(lang, "Mañana", "Tomorrow")
    : t(lang, `En ${hol.days_until} días`, `In ${hol.days_until} days`));
  // If every quick card is time-bound, the heading expires with the last of them.
  const timed = [hol?.valid_until, lot?.valid_until].filter(Boolean) as string[];
  const headingUntil = !sos && !con && timed.length ? { "data-line": "extras", "data-until": timed.sort().at(-1) } : {};

  // Official warnings (0034). Current: valid until our check is 45 minutes old.
  // Stale: the statement "we could not check since..." is as of this render.
  const al = h?.alerts ?? null;
  const alertsUntil = al ? (al.state === "current" ? al.valid_until : new Date(now + 45 * 60_000).toISOString()) : null;
  const showAlerts = Boolean(al && al.agency && live(alertsUntil));

  // Next match: while the schedule is current, and no later than two hours after kickoff.
  const nm = h?.next_match ?? null;
  const matchUntil = nm && h?.football_valid_until
    ? new Date(Math.min(Date.parse(h.football_valid_until), Date.parse(nm.kickoff) + 2 * HOUR)).toISOString() : null;
  const showMatch = Boolean(nm && live(matchUntil));
  const played = (m: Match) => m.home_score != null && m.away_score != null;
  const same = (m: Match) => showMatch && m.home_id === nm!.home_id && m.away_id === nm!.away_id && Date.parse(m.kickoff) === Date.parse(nm!.kickoff);
  // Today's league: finished with a score, or not yet two hours past kickoff; never a stale time.
  const league = live(h?.football_valid_until)
    ? (h!.league_today ?? []).filter((m) => !same(m) && (played(m) || Date.parse(m.kickoff) + 2 * HOUR > now)) : [];
  const footballUntil = [showMatch ? matchUntil : null, league.length ? h!.football_valid_until : null]
    .filter(Boolean).sort().at(-1) as string | undefined;

  // Their other towns, today.
  const towns = live(h?.weather_valid_until) ? h!.watch_weather ?? [] : [];
  const photoOf = (id: number) => watchPhotos.find((p) => p.municipality_id === id);

  // Reminders: day-bound.
  const plan = h?.plan ?? null;
  const pushCard = pushReady && h?.push_subscriptions === 0;
  const school = h?.school_next ?? null;
  const photo = h?.home_photo ?? null;

  const kickoffChip = (m: Match) => {
    if (m.is_today) return `${t(lang, "Hoy", "Today")} · ${formatTime12(m.kickoff, tz)}`;
    const day = localDate(m.kickoff, tz);
    return `${cap(formatWeekdayDate(day, lang).slice(0, 3))} ${Number(day.slice(8))} · ${formatTime12(m.kickoff, tz)}`;
  };

  return (
    <>
      <Head>
        <title>Hoy</title>
        <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
      </Head>
      <main data-render={renderId} data-rendered={renderedAt} data-lang={lang}>
        {/* Reserved for a future feature. Empty, and takes no space. */}
        <div id="slot"></div>
        {greeting && (
          <header className={photo ? "hello photo" : "hello"} data-line={greeting.key} data-until={greeting.valid_until}>
            {photo && <TownPhoto p={photo} lazy={false} />}
            <div>
              {photo && h?.home_town && <span className="place"><Icon name="pin" />{h.home_town}</span>}
              <h1>{greeting.text}</h1>
              <p>{`${x ? `${cap(formatWeekdayDate(today, lang))} · ` : ""}${t(lang, "Tu resumen de hoy", "Your day at a glance")}`}</p>
              {photo && <Credit p={photo} lang={lang} />}
            </div>
            {!photo && <Art name={greetingArt(greeting.text)} size={60} />}
          </header>
        )}
        {prompt === "municipality" && (
          <a className="prompt" href="/setup/municipality">
            {t(lang, "Elige tu municipio para ver el clima →", "Choose your town to see the weather →")}
          </a>
        )}
        {rest.map((line) => {
          const tile = TILE[line.key];
          const rain = line.key === "weather" && /, (lluvia|rain)$/.test(line.text);
          const cls = `tile ${line.key}${line.key === "weather" ? (rain ? " rainy" : " sunny") : ""}`;
          const inner = (
            <>
              {line.key === "fixture" && x?.team
                ? <Crest id={x.team.id} name={x.team.name} has={x.team.crest} size={46} />
                : tile && <span className="ico"><Icon name={line.key === "weather" ? (rain ? "rain" : "sun") : tile.icon} /></span>}
              <span>
                <small>
                  {line.key === "rate" && x && FLAG[x.country] && <span className="flag">{`${FLAG.CA} → ${FLAG[x.country]}`}</span>}
                  {line.note ?? (tile ? t(lang, tile.es, tile.en) : "")}
                </small>
                <p className="line">{line.text}</p>
              </span>
            </>
          );
          return tile?.href
            ? <a key={line.key} href={tile.href} className={cls} data-line={line.key} data-until={line.valid_until}>{inner}</a>
            : <div key={line.key} className={cls} data-line={line.key} data-until={line.valid_until}>{inner}</div>;
        })}

        {here && (
          <a className={`tile ${here.d.rain ? "rainy" : "sunny"}`} href="/clima#aqui" data-line="local" data-until={hereUntil}>
            <span className="ico"><Icon name={here.d.rain ? "rain" : "sun"} /></span>
            <span>
              <small>{`${here.name} ${t(lang, "hoy", "today")} ${FLAG.CA}`}</small>
              <p className="line">{`${here.d.temp}${here.d.low != null ? ` · ${t(lang, "mín", "low")} ${here.d.low}°` : ""}${here.d.rain ? t(lang, ", lluvia", ", rain") : ""}`}</p>
              {here.d.rain_prob != null && <small>{t(lang, `Probabilidad de lluvia: ${here.d.rain_prob}%`, `Chance of rain: ${here.d.rain_prob}%`)}</small>}
            </span>
          </a>
        )}

        {showAlerts && al && (
          <section data-line="alerts" data-until={alertsUntil!}>
            <h2>{t(lang, "Avisos oficiales", "Official warnings")}</h2>
            {al.state === "current" && (al.here ?? []).map((a) => (
              <a key={a.id} className={`alert ${a.level}`} href="/clima">
                <span className="level"><span className="i"><Icon name="alert" /></span>{LEVEL[a.level]?.[lang === "en" ? 1 : 0] ?? a.level}</span>
                <p><strong>{a.headline ?? a.event}</strong></p>
                {a.area_desc && <small>{a.area_desc}</small>}
                <small>{`${al.agency}${a.issued_at ? ` · ${t(lang, "Emitido", "Issued")}: ${moment(a.issued_at)}` : ""}`}</small>
              </a>
            ))}
            {al.state === "current" && al.checked_at && (
              <a className="tile calm" href="/clima">
                <span className="ico"><Icon name="check" /></span>
                <span><p>{t(lang, `Revisamos los avisos de ${al.agency} a las ${moment(al.checked_at)}.`,
                                  `We checked ${al.agency} warnings at ${moment(al.checked_at)}.`)}</p></span>
              </a>
            )}
            {al.state === "stale" && (
              <div className="tile stale">
                <span className="ico"><Icon name="alert" /></span>
                <span>
                  <p>{al.checked_at
                    ? t(lang, `No hemos podido revisar los avisos de ${al.agency} desde las ${moment(al.checked_at)}.`,
                              `We have not been able to check ${al.agency} warnings since ${moment(al.checked_at)}.`)
                    : t(lang, `No hemos podido revisar los avisos de ${al.agency}.`, `We have not been able to check ${al.agency} warnings.`)}</p>
                  {al.agency_url && <a href={al.agency_url} rel="noopener">{t(lang, `Ver avisos de ${al.agency}`, `See ${al.agency} warnings`)}</a>}
                </span>
              </div>
            )}
          </section>
        )}

        {footballUntil && h && (
          <section data-line="football" data-until={footballUntil}>
            <h2>{t(lang, "Fútbol", "Football")}</h2>
            {showMatch && nm && (
              <a className="card match" href="/futbol" data-line="match" data-until={matchUntil!}>
                <small>{`${t(lang, "Próximo partido", "Next match")}${h.league ? ` · ${h.league}` : ""}${nm.status && STATUS[nm.status] ? ` · ${STATUS[nm.status][lang === "en" ? 1 : 0]}` : ""}`}</small>
                <span><Crest id={nm.home_id} name={nm.home} has={nm.home_crest} size={48} />{nm.home}</span>
                <b className="chip">{kickoffChip(nm)}</b>
                <span><Crest id={nm.away_id} name={nm.away} has={nm.away_crest} size={48} />{nm.away}</span>
              </a>
            )}
            {league.length > 0 && (
              <a className="card lg" href="/futbol" data-line="league" data-until={h.football_valid_until!}>
                <small>{t(lang, "Hoy en la liga", "In the league today")}</small>
                {league.map((m) => (
                  <span key={m.kickoff + m.home}>
                    <span><Crest id={m.home_id} name={m.home} has={m.home_crest} size={26} />{m.home}</span>
                    {played(m) ? <b>{`${m.home_score}–${m.away_score}`}</b> : <b className="chip">{formatTime12(m.kickoff, tz)}</b>}
                    <span>{m.away}<Crest id={m.away_id} name={m.away} has={m.away_crest} size={26} /></span>
                  </span>
                ))}
              </a>
            )}
          </section>
        )}

        {towns.length > 0 && h && (
          <section data-line="watch" data-until={h.weather_valid_until!}>
            <h2>{t(lang, "Tus otros municipios", "Your other towns")}</h2>
            <div className="towns">
              {towns.map((w) => {
                const p = w.photo ? photoOf(w.id) : undefined;
                return (
                  <a key={w.id} className="town" href={`/clima#t${w.id}`}>
                    {p ? <TownPhoto p={p} className="thumb" />
                       : <span className={`thumb ${w.today.rain ? "rain" : "sun"}`}><Art name={w.today.rain ? "rainy" : "sunny"} size={48} /></span>}
                    <span className="tb">
                      <b>{w.name}</b>
                      <span className="tt"><span className="i"><Icon name={w.today.rain ? "rain" : "sun"} /></span>{w.today.temp}</span>
                      <small>{w.today.rain ? t(lang, "Hoy · lluvia", "Today · rain") : t(lang, "Hoy", "Today")}</small>
                    </span>
                  </a>
                );
              })}
            </div>
            {towns.map((w) => {
              const p = w.photo ? photoOf(w.id) : undefined;
              return p ? <Credit key={w.id} p={p} lang={lang} place={w.name} /> : null;
            })}
          </section>
        )}

        {(hol || sos || con || lot) && <h2 {...headingUntil}>{t(lang, "Útil para ti", "Useful for you")}</h2>}
        {hol && (
          <a className="tile holiday" href="/mas/feriados" data-line="holiday" data-until={hol.valid_until}>
            <DateBlock date={hol.date} lang={lang} />
            <span>
              <small>{`${t(lang, "Próximo feriado", "Next holiday")} ${FLAG[x!.country] ?? ""}`}</small>
              <p className="line">{hol.name}</p>
              <small>
                <span className="chip" data-line="holiday-days" data-until={holDayEnd}>{soon}</span>
                {` ${cap(formatWeekdayDate(hol.date, lang))}`}
              </small>
              <small>{verified(hol.verified_at)}</small>
            </span>
          </a>
        )}
        {(sos || con) && (
          <div className={sos && con ? "pair" : undefined}>
            {sos && (
              <a className="card call sos" href={tel(sos.number)}>
                <span className="ico"><Icon name="phone" /></span>
                <small>{t(lang, "Emergencias", "Emergencies")}</small>
                <span className="num">{sos.number}</span>
                <small>{t(lang, "Policía, bomberos y ambulancia", "Police, fire, ambulance")}</small>
                <small>{verified(sos.verified_at)}</small>
              </a>
            )}
            {con && (
              <div className="card call">
                <a href="/mas/consulado">
                  <span className="ico"><Icon name="pin" /></span>
                  <small>{t(lang, "Tu consulado", "Your consulate")}</small>
                  <span className="line">{con.city}</span>
                </a>
                {/* The first number; /mas/consulado lists them all. */}
                {con.phone && <a className="dial" href={tel(con.phone)}><Icon name="phone" />{con.phone.split("/")[0].trim()}</a>}
                <small>{verified(con.verified_at)}</small>
              </div>
            )}
          </div>
        )}
        {lot && (
          <a className="tile lottery" href="/mas/loteria" data-line="lottery" data-until={lot.valid_until}>
            <span className="ico"><Icon name="star" /></span>
            <span>
              <small>{`${t(lang, "Lotería", "Lottery")} · ${lot.game}`}</small>
              <Balls numbers={lot.numbers} />
              <small>{cap(formatWeekdayDate(lot.draw_date, lang)) + (lot.draw_time ? ` · ${drawTime(lot.draw_time)}` : "")}</small>
              <small>{`${verified(localDate(lot.verified_at, tz))}, ${formatTime12(lot.verified_at, tz)}`}</small>
            </span>
          </a>
        )}

        {(plan || pushCard || school) && (
          <section data-line="reminders" data-until={dayEnd}>
            <h2>{t(lang, "Recordatorios", "Reminders")}</h2>
            {plan && (
              <div className={`tile plan${plan.status === "due" ? " due" : ""}`} data-line="plan" data-until={dayEnd}>
                <span className="ico"><Icon name="key" /></span>
                <span>
                  <small>{t(lang, "Tu plan de Hoy", "Your Hoy plan")}</small>
                  <p className="line">{t(lang, `Tu plan vence el ${formatDate(plan.period_end, lang, true)}`, `Your plan ends on ${formatDate(plan.period_end, lang, true)}`)}</p>
                  {plan.status === "due" && (
                    <small>
                      <span className="chip warn">{plan.days_left <= 0 ? t(lang, "Vence hoy", "Ends today")
                        : plan.days_left === 1 ? t(lang, "Queda 1 día", "1 day left")
                        : t(lang, `Quedan ${plan.days_left} días`, `${plan.days_left} days left`)}</span>
                      {` ${t(lang, "Cualquier afiliado de Hoy puede renovarlo.", "Any Hoy affiliate can renew it.")}`}
                    </small>
                  )}
                </span>
              </div>
            )}
            {pushCard && (
              <a className="tile push" href="/mas/avisos" data-line="push" data-until={dayEnd}>
                <span className="ico"><Icon name="bell" /></span>
                <span>
                  <small>{t(lang, "Notificaciones", "Notifications")}</small>
                  <p className="line">{t(lang, "Activa las alertas", "Turn on alerts")}</p>
                  <small>{al?.agency
                    ? t(lang, `Los avisos oficiales de ${al.agency} para tus municipios, en este teléfono.`, `Official ${al.agency} warnings for your towns, on this phone.`)
                    : t(lang, "Tu equipo, la tasa y la lotería: como máximo una al día.", "Your team, the rate and the lottery: at most one a day.")}</small>
                </span>
              </a>
            )}
            {school && (
              <a className="tile school" href="/mas/escuela" data-line="school" data-until={dayEnd}>
                <DateBlock date={school.start_date} lang={lang} />
                <span>
                  <small>{`${t(lang, "Calendario escolar", "School calendar")} ${x ? FLAG[x.country] ?? "" : ""}`}</small>
                  <p className="line">{school.event_name}</p>
                  <small>{school.end_date && school.end_date !== school.start_date
                    ? `${formatDate(school.start_date, lang)} – ${formatDate(school.end_date, lang)}`
                    : cap(formatWeekdayDate(school.start_date, lang))}</small>
                  <small>{verified(school.verified_at)}</small>
                </span>
              </a>
            )}
          </section>
        )}
        <p id="stamp" hidden></p>
      </main>
      <TabBar current="inicio" lang={lang} />
      <script dangerouslySetInnerHTML={{ __html: OPEN_SCRIPT }} />
    </>
  );
}
