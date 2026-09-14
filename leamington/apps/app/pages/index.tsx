/**
 * Home: a morning message, not a dashboard.
 *
 *   Buenos días, {name}            on Leamington's sky right now
 *   {team} juega hoy 7pm           only when a fixture exists
 *   {municipality}: 28°            their home town
 *   1 CAD = 18.51 HNL ↑            reference rate
 *   Faltan 127 días                departure, or a settled user's next trip
 *
 * Every line comes from our Postgres via app.render_home, which decides what is
 * current enough to show. A line without current data is absent, never stale and
 * never a placeholder. If setup never reached the municipality, a single link
 * offers it at most once a day: never modal, never blocking. No client runtime
 * JS; one small inline script (see lib/open-script.ts).
 *
 * The top row holds the member's initials, the "Miembro" pill and a bell to
 * Clima's official warnings (a dot only while our current copy has warnings for
 * their town). The hero's colours follow Leamington's sky (dawn, day, dusk,
 * night; astronomy from lib/ui.tsx), with their hometown photo and its credit
 * when we hold one (0034). Below the message, in this order, each section only
 * when its real data exists and carrying its own expiry (data-line/data-until),
 * so an offline copy drops it: official warnings status, their team's next
 * match and today's league, their other towns' weather (app.home_more), "Útil
 * para ti" quick cards (app.home_extras), and reminders: plan, alerts on this
 * phone, school.
 */
import Head from "next/head";
import type { GetServerSideProps } from "next";
import { formatCode } from "@leamington/shared/src/code.ts";
import { formatDate, formatTime12, formatWeekdayDate, localDate } from "@leamington/shared/src/format.ts";
import { db } from "../lib/db";
import { readSession, cookieValue, clearedCookie } from "../lib/session";
import { EXPIRE_SCRIPT, OPEN_SCRIPT } from "../lib/open-script";
import { ahoraWord, nowArt, nowData, nowLive, type Now } from "../lib/now";
import { recordView, type Access } from "../lib/client";
import { t } from "../lib/t";
import { HomeTop, OfflineBar, TabBar } from "../lib/frame";
import { AllaAqui, BadgesRow, SeasonCard, WelcomeScreen, type MemberCard, type Season } from "../lib/member";
import { WeekDots, type WeekPoint } from "../lib/money";
import { HomeNews, type NewsHome } from "../lib/news";
import { EXPIRY_CSS } from "../lib/page-css";
import { DstCard, HoursStrip, WorkdayCard, type Hourly, type Workday } from "../lib/workday";
import {
  Art, Balls, Credit, Crest, DateBlock, FLAG, Icon, Num, Pic, Ring, SKY_PHASES, TownPhoto, dayArt, drawTime, localDayEnd, skyPhase, tel,
  type ArtName, type Photo, type SkyPhase,
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
  watch_weather: { id: number; name: string; photo: boolean; today: { temp: string; rain: boolean }; now?: Now | null }[] | null;
  weather_valid_until: string | null;
  alerts: { state: "current" | "stale"; checked_at: string | null; valid_until: string | null; agency: string | null; agency_url: string | null; here: Warning[] | null } | null;
  plan: { period_end: string; days_left: number; status: "active" | "due" } | null;
  push_subscriptions: number;
  school_next: { event_name: string; start_date: string; end_date: string | null; verified_at: string } | null;
  // The weather right now (0040): null below two fresh providers; each carries valid_until.
  home_now?: Now | null; leamington_now?: Now | null;
  // Round 2 (0041): the member card, the season ring, badge counts, the welcome flag, the hometown's timezone.
  member?: MemberCard | null; season?: Season | null; badges_earned?: number; badges_total?: number;
  welcomed?: boolean; home_timezone?: string | null;
  // Round 4 (0044): Leamington's working day in icons.
  workday?: Workday | null;
  // Noticias (0047): one lead story with a picture and two headlines, or null.
  news?: NewsHome | null;
};
// Today's forecast at their home town, for the high and low beside "Ahora".
type HomeDay = { timezone: string; name: string; lat: number | null; lng: number | null; d: { temp: string; low: number | null; rain?: boolean } | null };
// The next holiday in Ontario or at home (0042), and the rate's week for the dots.
type HolidayNext = { date: string; name: string; where: string; days_left: number; verified_at: string };
type Expired = { language: "es" | "en"; access: Access };
type Here = { name: string; d: { temp: string; low: number | null; rain: boolean; rain_prob?: number | null } };
type Props =
  | {
      renderId: string; renderedAt: string; language: "es" | "en"; lines: Line[]; prompt: string | null;
      extras: Extras | null; more: More | null; watchPhotos: Photo[]; pushReady: boolean; here: Here | null;
      name: string; sky: SkyPhase; homeDay: HomeDay | null; welcome: boolean; allaAt: string;
      week: WeekPoint[]; holNext: HolidayNext | null; hours: Hourly | null; opened: { days: number; weekdays: (boolean | null)[] } | null; expired?: undefined;
    }
  | { expired: Expired };

export const getServerSideProps: GetServerSideProps<Props> = async ({ req, res, query }) => {
  res.setHeader("Cache-Control", "private, no-cache");
  const clientId = readSession(cookieValue(req.headers.cookie));
  if (!clientId) return { redirect: { destination: "/login", permanent: false } };

  // No paid period covering today: the expiry screen instead of the morning message.
  const access = await db().query(
    "select language, full_name, text_size, to_jsonb(clients)->>'theme' as theme, app.client_access(id) as access from clients where id = $1 and active", [clientId]);
  const a = access.rows[0];
  // Letra grande: <html class="big"> (pages/_document.tsx).
  (req as { appTextSize?: string; appTheme?: string }).appTextSize = a?.text_size;
  (req as { appTheme?: string }).appTheme = a?.theme;
  if (a?.access && !a.access.paid) {
    (req as { appLang?: string }).appLang = a.language;
    await recordView(clientId, "expiry", { status: a.access.status, period_end: a.access.period_end });
    return { props: { expired: { language: a.language, access: a.access } } };
  }

  const [home, extras, moreRow, hereRow, homeDayRow, weekRow, holRow, hoursRow, openedRow] = await Promise.all([
    db().query("select app.render_home($1) as m", [clientId]),
    db().query("select app.home_extras($1) as x", [clientId]),
    db().query("select app.home_more($1) as h", [clientId]),
    // Leamington today (0036), under the same two-provider rules as Clima.
    db().query(
      `select lp.name, app.local_forecast_summary(lp.id, (now() at time zone lp.timezone)::date, now(), c.language::text) as d
         from local_places lp, clients c
        where lp.key = 'leamington' and lp.active and c.id = $1`, [clientId]),
    // Their home town's forecast today (the same summary as Clima), and its timezone.
    db().query(
      `select m.timezone, m.name, m.lat, m.lng, app.forecast_summary(m.id, (now() at time zone m.timezone)::date, now(), c.language::text) as d
         from clients c join municipalities m on m.id = c.municipality_id where c.id = $1`, [clientId]),
    // Round 3 (0042): the rate's last seven real days, and the next holiday here or there.
    db().query("select app.fx_history($1, 7)->'week' as w", [clientId]),
    db().query("select app.holidays_here_and_there($1, now(), 1)->0 as n", [clientId]),
    // Round 4 (0044): Leamington's next 6 hours for the strip.
    db().query("select app.hourly_outlook('leamington', now(), 6, c.language::text) as h from clients c where c.id = $1", [clientId]),
    // Round 5 (0045): the week's opened days, for the "Tu semana" teaser.
    db().query("select app.week_summary($1)->'opened' as o", [clientId]),
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

  // The welcome screen, once: not yet welcomed, and setup complete (0041). The
  // expiry screen above still wins. Not recorded as a page view: 0041 counts every
  // page but setup and expiry toward Explorador, and welcomed_at is its record.
  const welcome = more?.welcomed === false
    && !(await db().query("select app.setup_next_step($1) as step", [clientId])).rows[0]?.step;

  // LOCAL ONLY: HOY_SKY_PREVIEW=1 lets ?sky=night force the hero's sky, and ?at=
  // the moment "Allá y aquí" shows, for screenshots. Production never sets it.
  const preview = process.env.HOY_SKY_PREVIEW === "1";
  const forced = preview && typeof query.sky === "string"
    && (SKY_PHASES as readonly string[]).includes(query.sky) ? (query.sky as SkyPhase) : null;
  const clock = preview && typeof query.at === "string" && Number.isFinite(Date.parse(query.at)) ? new Date(query.at).toISOString() : null;
  // LOCAL ONLY, same guard: the workday card and next hours asked for at that moment.
  if (clock && more) {
    const { rows } = await db().query(
      `select app.workday_outlook('leamington', $2::timestamptz, language::text) as w, app.hourly_outlook('leamington', $2::timestamptz, 6, language::text) as h
         from clients where id = $1`, [clientId, clock]);
    more.workday = rows[0]?.w ?? null;
    hoursRow.rows[0] = { h: rows[0]?.h ?? null };
  }

  (req as { appLang?: string }).appLang = m.language;
  return {
    props: {
      renderId: m.render_id, renderedAt: m.rendered_at, language: m.language, lines: m.lines, prompt: m.prompt ?? null,
      extras: extras.rows[0]?.x ?? null, more, watchPhotos,
      here: hereRow.rows[0]?.d ? { name: hereRow.rows[0].name, d: hereRow.rows[0].d } : null,
      // The "turn on alerts" card only where this server can actually subscribe a phone.
      pushReady: Boolean(process.env.VAPID_PUBLIC_KEY?.trim()),
      name: a?.full_name ?? "",
      sky: forced ?? skyPhase(new Date()),
      homeDay: homeDayRow.rows[0] ? {
        timezone: homeDayRow.rows[0].timezone, name: homeDayRow.rows[0].name, lat: homeDayRow.rows[0].lat, lng: homeDayRow.rows[0].lng,
        d: homeDayRow.rows[0].d ?? null,
      } : null,
      welcome,
      allaAt: clock ?? m.rendered_at,
      week: weekRow.rows[0]?.w ?? [],
      holNext: holRow.rows[0]?.n ?? null,
      hours: hoursRow.rows[0]?.h ?? null,
      opened: openedRow.rows[0]?.o ?? null,
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
        <style dangerouslySetInnerHTML={{ __html: EXPIRY_CSS }} />
      </Head>
      <main data-lang={lang}>
        <header className="hello">
          <div>
            <span className="lbl">Hoy</span>
            <h1>{a.status === "lapsed"
              ? t(lang, "Tu suscripción a Hoy terminó", "Your Hoy subscription has ended")
              : t(lang, "Tu cuenta de Hoy no tiene un periodo pagado", "Your Hoy account has no paid period")}</h1>
            {a.period_end && (
              <p>{t(lang, `Terminó el ${formatDate(a.period_end, lang, true)}.`, `It ended on ${formatDate(a.period_end, lang, true)}.`)}</p>
            )}
          </div>
          <Art name="clock" size={72} />
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
          <Pic name="warning" />
          <span><p className="line">{t(lang, "Los avisos oficiales del clima siguen aquí", "Official weather warnings are still here")}</p></span>
        </a>
      </main>
    </>
  );
}

// Each home line as a row: a picture (or the team's crest), a short label, and
// the line with its number set large where the line has one. The row carries
// data-line/data-until, so the offline script removes it when the line expires.
const TILE: Record<string, { href?: string; es: string; en: string; art: ArtName }> = {
  fixture: { href: "/futbol", es: "Fútbol", en: "Football", art: "football" },
  weather: { href: "/clima", es: "Clima", en: "Weather", art: "partly-day" },
  rate: { href: "/mas/tasa", es: "Tasa de referencia", en: "Reference rate", art: "money" },
  countdown: { es: "Tu fecha", en: "Your date", art: "plane" },
};

/** The line's number pulled forward: label, number, unit, and the rest. Null keeps the sentence as written. */
function split(line: Line, lang: "es" | "en"): { label?: string; num: string; unit?: string; sub?: string } | null {
  let r: RegExpExecArray | null;
  if (line.key === "weather" && (r = /^(.+?): (-?\d+°(?:\s?[–-]\s?-?\d+°)?)(?:, (.+))?$/.exec(line.text))) {
    return { label: r[1], num: r[2], sub: r[3] ? r[3].charAt(0).toUpperCase() + r[3].slice(1) : undefined };
  }
  if (line.key === "rate" && (r = /^1 CAD = ([\d.,]+) ([A-Z]{3})( [↑↓])?(?: \((.+)\))?$/.exec(line.text))) {
    return { num: r[1], unit: `${r[2]}${r[3] ?? ""}`, sub: ["1 CAD", r[4] ? r[4].charAt(0).toUpperCase() + r[4].slice(1) : null].filter(Boolean).join(" · ") };
  }
  if (line.key === "countdown" && (r = /^Faltan (\d+) días$|^(\d+) days to go$/.exec(line.text))) {
    return { label: t(lang, "Faltan para tu fecha", "Until your date"), num: r[1] ?? r[2], unit: t(lang, "días", "days") };
  }
  return null;
}

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
  const { renderId, renderedAt, language: lang, lines, prompt, extras: x, more: h, watchPhotos, pushReady, here, name, sky, homeDay, allaAt } = props;
  if (props.welcome) {
    return <WelcomeScreen lang={lang} first={h?.member?.first_name ?? name.split(" ")[0]} member={h?.member ?? null}
                          photo={h?.home_photo ?? null} place={h?.home_town ?? null} sky={sky} />;
  }
  const greeting = lines.find((l) => l.key === "greeting");
  const tz = x?.timezone ?? "America/Toronto";
  const now = Date.parse(renderedAt);
  // "Ahora" (0040): only with a temperature and observation time, and only until it expires.
  const homeNow = nowLive(h?.home_now, now) ? h!.home_now! : null;
  const leamNow = nowLive(h?.leamington_now, now) ? h!.leamington_now! : null;
  const rest = lines.filter((l) => l !== greeting);
  // The weather now at home leads its row even when today's forecast line is absent.
  if (homeNow && !rest.some((l) => l.key === "weather")) {
    rest.splice(rest.some((l) => l.key === "fixture") ? 1 : 0, 0, { key: "weather", text: "", valid_until: homeNow.valid_until });
  }
  // Anything whose validity has already passed is not rendered at all.
  const live = (until: string | null | undefined): until is string => Boolean(until) && Date.parse(until!) > now;
  const today = localDate(renderedAt, tz);
  const dayEnd = localDayEnd(new Date(now), tz);
  // Leamington today: until local midnight, and no longer than the forecast window (3 hours).
  const hereUntil = new Date(Math.min(Date.parse(dayEnd), now + 3 * HOUR)).toISOString();
  const moment = (iso: string) =>
    localDate(iso, tz) === today ? formatTime12(iso, tz) : `${formatTime12(iso, tz)}, ${formatDate(localDate(iso, tz), lang)}`;
  const verified = (day: string) => `${t(lang, "Verificado", "Verified")}: ${formatDate(day, lang)}`;
  const seeAll = t(lang, "Ver todo", "See all");

  // Útil para ti (0033).
  // The next holiday in Ontario or at home (0042), within 120 days as before.
  const hol = props.holNext && props.holNext.days_left <= 120
    ? { date: props.holNext.date, name: props.holNext.name, where: props.holNext.where, days_until: props.holNext.days_left,
        verified_at: props.holNext.verified_at, valid_until: dayEnd }
    : null;
  const sos = x?.emergency ?? null;
  const con = x?.consulate ?? null;
  const lot = x?.lottery && x.lottery.numbers.length > 0 ? x.lottery : null;
  // "en 2 días" is only true on the day it was rendered: it expires at local midnight.
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
  const warningsHere = showAlerts && al?.state === "current" ? (al.here ?? []).length : 0;

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

  const high = t(lang, "máx", "high");
  // Round 2: the season ring and badges are day-bound; the clocks hold 15 minutes.
  const season = h?.season ?? null;
  const badgesTotal = h?.member ? h.badges_total ?? 0 : 0;
  const allaUntil = new Date(now + 15 * 60_000).toISOString();
  const arrows = (hi: string | undefined, lo: number | null | undefined) =>
    [hi ? `↑${hi}` : null, lo != null ? `↓${lo}°` : null].filter(Boolean).join(" ");

  // Their home town: "Ahora" when current, with the forecast's high and low; else
  // today's forecast high, labelled "máx" so it never reads as the temperature now.
  // If "Ahora" expires on a cached copy, the forecast shows in its place.
  const homeTile = (line: Line) => {
    const s = line.text ? split(line, lang) : null;
    const town = s?.label ?? h?.home_town ?? "";
    const rain = /, (lluvia|rain)/.test(line.text);
    const lo = homeDay?.d?.low;
    const hl = arrows(s?.num, lo);
    return (
      <a key="weather" href="/clima" className="tile weather" data-line="weather" data-until={line.valid_until}>
        {homeNow && (
          <span className="ahora" {...nowData("home-now", homeNow)}>
            <Pic name={nowArt(homeNow)} />
            <span className="tx">
              <small>{town || t(lang, "Tu municipio", "Your town")}</small>
              <span className="nb"><Num value={homeNow.temp} /></span>
              <small className="at">{ahoraWord(lang)}{homeDay ? ` ${formatTime12(homeNow.observed_at, homeDay.timezone)}` : ""}</small>
              {(homeNow.label || hl) && <small>{[homeNow.label, hl].filter(Boolean).join(" · ")}</small>}
            </span>
          </span>
        )}
        {line.text && (
          <span className="fc">
            <Pic name={rain ? "rain" : "partly-day"} />
            <span className="tx">
              <small>{town || t(lang, "Clima", "Weather")}</small>
              {s ? <span className="nb"><Num value={s.num} /><em>{high}</em></span> : <p className="line">{line.text}</p>}
              {(lo != null || s?.sub) && <small>{[lo != null ? `↓${lo}°` : null, s?.sub].filter(Boolean).join(" · ")}</small>}
            </span>
          </span>
        )}
      </a>
    );
  };

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
        <OfflineBar at={renderedAt} tz={tz} lang={lang} />
        {/* Reserved for a future feature. Empty, and takes no space. */}
        <div id="slot"></div>
        <HomeTop lang={lang} name={name} warnings={warningsHere} until={alertsUntil} />
        {greeting && (
          <header className={`hello sk s-${sky}`} data-line={greeting.key} data-until={greeting.valid_until}>
            <Art name={sky === "night" ? "moon" : "sun"} size={92} />
            <div>
              <span className="lbl">{cap(formatWeekdayDate(today, lang))}</span>
              <h1>{greeting.text}</h1>
              {/* Ahora: Leamington's current conditions (home_more.leamington_now) will sit here. */}
              {photo && (
                <>
                  <div className="ht">
                    <a href={`/clima#t${photo.municipality_id}`} aria-label={t(lang, `Fotos de ${h?.home_town ?? ""}`, `Photos of ${h?.home_town ?? ""}`)}>
                      <TownPhoto p={photo} lazy={false} />
                    </a>
                    {h?.home_town && <span><span className="place"><Icon name="pin" />{h.home_town}</span></span>}
                  </div>
                  {/* The credit whole, under the photo row (never cut short). */}
                  <Credit p={photo} lang={lang} licenseFirst />
                </>
              )}
            </div>
          </header>
        )}
        {prompt === "municipality" && (
          <a className="prompt" href="/setup/municipality">
            {t(lang, "Elige tu municipio para ver el clima →", "Choose your town to see the weather →")}
          </a>
        )}
        {rest.map((line) => {
          if (line.key === "weather") return homeTile(line);
          // The season card below says the same days with more: it replaces this line.
          if (line.key === "countdown" && season) return null;
          const tile = TILE[line.key];
          const rain = line.key === "weather" && /, (lluvia|rain)/.test(line.text);
          const cls = `tile ${line.key}`;
          const s = split(line, lang);
          const flags = line.key === "rate" && x && FLAG[x.country] ? `${FLAG.CA}→${FLAG[x.country]} ` : "";
          const inner = (
            <>
              {line.key === "fixture" && x?.team
                ? <Crest id={x.team.id} name={x.team.name} has={x.team.crest} size={50} />
                : tile && <Pic name={line.key === "weather" ? (rain ? "rain" : "partly-day") : tile.art} />}
              <span>
                <small>{flags}{s?.label ?? line.note ?? (tile ? t(lang, tile.es, tile.en) : "")}</small>
                {s
                  ? <span className="nb"><Num value={s.num} />{s.unit && <em>{s.unit}</em>}</span>
                  : <p className="line">{line.text}</p>}
                {s?.sub && <small>{s.sub}</small>}
                {line.key === "rate" && props.week.length > 0 && <WeekDots week={props.week} lang={lang} />}
              </span>
            </>
          );
          return tile?.href
            ? <a key={line.key} href={tile.href} className={cls} data-line={line.key} data-until={line.valid_until}>{inner}</a>
            : <div key={line.key} className={cls} data-line={line.key} data-until={line.valid_until}>{inner}</div>;
        })}

        {(here || leamNow) && (
          <a className={`tile${here?.d.rain_prob != null ? " x" : ""}`} href="/clima#aqui"
             data-line={here ? "local" : "leamington"} data-until={here ? hereUntil : leamNow!.valid_until}>
            {leamNow && (
              <span className="ahora" {...nowData("leamington-now", leamNow)}>
                <Pic name={nowArt(leamNow)} />
                <span className="tx">
                  <small>{here?.name ?? "Leamington"}</small>
                  <span className="nb"><Num value={leamNow.temp} /></span>
                  <small className="at">{ahoraWord(lang)}{` ${formatTime12(leamNow.observed_at, "America/Toronto")}`}</small>
                  {(leamNow.label || here) && <small>{[leamNow.label, here ? arrows(here.d.temp, here.d.low) : null].filter(Boolean).join(" · ")}</small>}
                </span>
              </span>
            )}
            {here && (
              <span className="fc">
                <Pic name={dayArt(here.d)} />
                <span className="tx">
                  <small>{`${here.name} ${t(lang, "hoy", "today")} ${FLAG.CA}`}</small>
                  <span className="nb"><Num value={here.d.temp} /><em>{high}</em></span>
                  {(here.d.low != null || here.d.rain) && (
                    <small>{[here.d.low != null ? `↓${here.d.low}°` : null, here.d.rain ? t(lang, "Lluvia", "Rain") : null].filter(Boolean).join(" · ")}</small>
                  )}
                </span>
              </span>
            )}
            {here?.d.rain_prob != null && <Ring pct={here.d.rain_prob} unit={t(lang, "lluvia", "rain")} tone="rain" />}
          </a>
        )}

        {showAlerts && al && (
          <section data-line="alerts" data-until={alertsUntil!}>
            <div className="sh"><h2>{t(lang, "Avisos oficiales", "Official warnings")}</h2><a href="/clima#avisos">{seeAll}</a></div>
            {al.state === "current" && (al.here ?? []).map((a) => (
              <a key={a.id} className={`alert ${a.level}`} href="/clima#avisos">
                <span className="level"><span className="i"><Icon name="alert" /></span>{LEVEL[a.level]?.[lang === "en" ? 1 : 0] ?? a.level}</span>
                <p><strong>{a.headline ?? a.event}</strong></p>
                {a.area_desc && <small>{a.area_desc}</small>}
                <small>{`${al.agency}${a.issued_at ? ` · ${t(lang, "Emitido", "Issued")}: ${moment(a.issued_at)}` : ""}`}</small>
              </a>
            ))}
            {al.state === "current" && al.checked_at && (
              <a className="tile calm" href="/clima#avisos">
                <Pic name="clock" />
                <span><p>{t(lang, `Revisamos los avisos de ${al.agency} a las ${moment(al.checked_at)}.`,
                                  `We checked ${al.agency} warnings at ${moment(al.checked_at)}.`)}</p></span>
              </a>
            )}
            {al.state === "stale" && (
              <div className="tile stale">
                <Pic name="warning" />
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

        {h?.workday && live(h.workday.valid_until) && <WorkdayCard w={h.workday} lang={lang} />}
        {props.hours && live(props.hours.valid_until) && (
          <section data-line="hours" data-until={props.hours.valid_until}>
            <div className="sh"><h2>{t(lang, "Próximas horas", "Next hours")}</h2><a href="/clima/aqui">{seeAll}</a></div>
            <HoursStrip h={props.hours} />
          </section>
        )}
        {season && <SeasonCard s={season} lang={lang} until={dayEnd} />}
        {badgesTotal > 0 && <BadgesRow earned={h!.badges_earned ?? 0} total={badgesTotal} lang={lang} until={dayEnd} />}
        {props.opened && (
          <a className="tile weekt" href="/mas/semana" data-line="week" data-until={dayEnd}>
            <Pic name="week" />
            <span className="tx">
              <small>{t(lang, "Tu semana", "Your week")}</small>
              <span className="nb"><Num value={String(props.opened.days)} /><em>{props.opened.days === 1 ? t(lang, "día", "day") : t(lang, "días", "days")}</em></span>
              <span className="wd">{props.opened.weekdays.map((v, i) => <i key={i} className={v === true ? "up" : v === false ? "no" : "nd"} />)}</span>
            </span>
          </a>
        )}
        <DstCard at={new Date(allaAt)} lang={lang} homeTz={h?.home_timezone} homeName={homeDay?.name} />
        {h?.home_timezone && homeDay && (
          <AllaAqui lang={lang} at={allaAt} until={allaUntil} leamNow={leamNow}
                    home={{ name: homeDay.name, tz: h.home_timezone, lat: homeDay.lat, lng: homeDay.lng, now: homeNow }} />
        )}

        {footballUntil && h && (
          <section data-line="football" data-until={footballUntil}>
            <div className="sh"><h2>{t(lang, "Fútbol", "Football")}</h2><a href="/futbol">{seeAll}</a></div>
            {showMatch && nm && (
              <a className="card match" href="/futbol" data-line="match" data-until={matchUntil!}>
                <small>{`${t(lang, "Próximo partido", "Next match")}${h.league ? ` · ${h.league}` : ""}${nm.status && STATUS[nm.status] ? ` · ${STATUS[nm.status][lang === "en" ? 1 : 0]}` : ""}`}</small>
                <span><Crest id={nm.home_id} name={nm.home} has={nm.home_crest} size={52} />{nm.home}</span>
                <b className="chip">{kickoffChip(nm)}</b>
                <span><Crest id={nm.away_id} name={nm.away} has={nm.away_crest} size={52} />{nm.away}</span>
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
            <div className="sh"><h2>{t(lang, "Tus otros municipios", "Your other towns")}</h2><a href="/clima">{seeAll}</a></div>
            <div className="towns">
              {towns.map((w) => {
                const p = w.photo ? photoOf(w.id) : undefined;
                return (
                  <a key={w.id} className="town" href={`/clima#t${w.id}`}>
                    {p ? <TownPhoto p={p} className="thumb" />
                       : <span className="thumb"><Art name={dayArt(w.today)} size={60} lazy /></span>}
                    <span className="tb">
                      <b>{w.name}</b>
                      {nowLive(w.now, now) && (
                        <span className="ahora" {...nowData("watch-now", w.now)}>
                          <span className="tt"><Art name={nowArt(w.now)} size={30} lazy /><Num value={w.now.temp} /></span>
                          <small>{ahoraWord(lang)}{` · ${high} ${w.today.temp}`}</small>
                        </span>
                      )}
                      <span className="fc">
                        <span className="tt"><Art name={dayArt(w.today)} size={30} lazy /><Num value={w.today.temp} /></span>
                        <small>{`${high} · ${w.today.rain ? t(lang, "Hoy · lluvia", "Today · rain") : t(lang, "Hoy", "Today")}`}</small>
                      </span>
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

        {(hol || sos || con || lot) && (
          <div className="sh" {...headingUntil}><h2>{t(lang, "Útil para ti", "Useful for you")}</h2><a href="/mas">{seeAll}</a></div>
        )}
        {hol && (
          <a className="tile holiday" href="/mas/feriados" data-line="holiday" data-until={hol.valid_until}>
            <DateBlock date={hol.date} lang={lang} />
            <span>
              <small>{`${t(lang, "Próximo feriado", "Next holiday")} · ${hol.where === "ON" ? `${FLAG.CA} Ontario` : FLAG[hol.where] ?? ""}`}</small>
              <p className="line">{hol.name}</p>
              <small>
                <span className="chip" data-line="holiday-days" data-until={dayEnd}>{soon}</span>
                {` ${cap(formatWeekdayDate(hol.date, lang).split(" ")[0])}`}
              </small>
              <small>{verified(hol.verified_at)}</small>
            </span>
          </a>
        )}
        {(sos || con) && (
          <div className={sos && con ? "pair" : undefined}>
            {sos && (
              <a className="card call sos" href={tel(sos.number)}>
                <Pic name="phone" />
                <span className="cx">
                  <small>{t(lang, "Emergencias", "Emergencies")}</small>
                  <span className="num">{sos.number}</span>
                  <small>{t(lang, "Policía, bomberos y ambulancia", "Police, fire, ambulance")}</small>
                  <small>{verified(sos.verified_at)}</small>
                </span>
              </a>
            )}
            {con && (
              <div className="card call">
                <Pic name="consulate" />
                <span className="cx">
                  <a href="/mas/consulado">
                    <small>{t(lang, "Tu consulado", "Your consulate")}</small>
                    <span className="line">{con.city}</span>
                  </a>
                  {/* The first number; /mas/consulado lists them all. */}
                  {con.phone && <a className="dial" href={tel(con.phone)}><Icon name="phone" />{con.phone.split("/")[0].trim()}</a>}
                  <small>{verified(con.verified_at)}</small>
                </span>
              </div>
            )}
          </div>
        )}
        {lot && (
          <a className="tile lottery" href="/mas/loteria" data-line="lottery" data-until={lot.valid_until}>
            <Pic name="lottery" />
            <span>
              <small>{`${t(lang, "Lotería", "Lottery")} · ${lot.game}`}</small>
              <Balls numbers={lot.numbers} />
              <small>{cap(formatWeekdayDate(lot.draw_date, lang)) + (lot.draw_time ? ` · ${drawTime(lot.draw_time)}` : "")}</small>
              <small>{`${verified(localDate(lot.verified_at, tz))}, ${formatTime12(lot.verified_at, tz)}`}</small>
            </span>
          </a>
        )}

        {/* Noticias (0047): after "Útil para ti", below the weather and work cards; "hace X" is computed at render. */}
        {h?.news && (h.news.lead || h.news.more.length > 0) && <HomeNews news={h.news} lang={lang} tz={tz} nowMs={now} />}

        {(plan || pushCard || school) && (
          <section data-line="reminders" data-until={dayEnd}>
            <h2>{t(lang, "Recordatorios", "Reminders")}</h2>
            {plan && (
              <div className={`tile plan${plan.status === "due" ? " due" : ""}`} data-line="plan" data-until={dayEnd}>
                <Pic name="crown" />
                <span>
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
                <Pic name="bell" />
                <span>
                  <p className="line">{t(lang, "Activa las alertas", "Turn on alerts")}</p>
                  <small>{al?.agency
                    ? t(lang, `Avisos oficiales de ${al.agency}, en este teléfono`, `Official ${al.agency} warnings, on this phone`)
                    : t(lang, "Tu equipo, la tasa y la lotería: máximo una al día", "Your team, the rate, the lottery: one a day at most")}</small>
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
      <script dangerouslySetInnerHTML={{ __html: OPEN_SCRIPT + EXPIRE_SCRIPT }} />
    </>
  );
}
