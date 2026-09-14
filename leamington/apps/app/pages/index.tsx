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
 * Below the message, "Útil para ti": quick cards from app.home_extras (0033),
 * each rendered only when its real record exists. Time-bound cards carry
 * data-line/data-until like the lines, so an offline copy drops them.
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
import { Art, Balls, Crest, DateBlock, FLAG, Icon, drawTime, greetingArt, tel, type IconName } from "../lib/ui";

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
type Expired = { language: "es" | "en"; access: Access };
type Props =
  | { renderId: string; renderedAt: string; language: "es" | "en"; lines: Line[]; prompt: string | null; extras: Extras | null; expired?: undefined }
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

  const [home, extras] = await Promise.all([
    db().query("select app.render_home($1) as m", [clientId]),
    db().query("select app.home_extras($1) as x", [clientId]),
  ]);
  const m = home.rows[0]?.m;
  if (!m) {
    res.setHeader("Set-Cookie", clearedCookie);
    return { redirect: { destination: "/login?e=inactive", permanent: false } };
  }

  (req as { appLang?: string }).appLang = m.language;
  return {
    props: {
      renderId: m.render_id, renderedAt: m.rendered_at, language: m.language, lines: m.lines, prompt: m.prompt ?? null,
      extras: extras.rows[0]?.x ?? null,
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

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function Home(props: Props) {
  if (props.expired) return <ExpiryScreen {...props.expired} />;
  const { renderId, renderedAt, language: lang, lines, prompt, extras: x } = props;
  const [greeting, ...rest] = lines;
  const tz = x?.timezone;
  const hol = x?.next_holiday ?? null;
  const sos = x?.emergency ?? null;
  const con = x?.consulate ?? null;
  const lot = x?.lottery && x.lottery.numbers.length > 0 ? x.lottery : null;
  const verified = (day: string) => `${t(lang, "Verificado", "Verified")}: ${formatDate(day, lang)}`;
  // "en 2 días" is only true on the day it was rendered: it carries its own
  // expiry (an hour early, to stay safe across a clock change).
  const dayEnd = hol ? new Date(Date.parse(hol.valid_until) - hol.days_until * 86_400_000 - 3_600_000).toISOString() : "";
  const soon = hol && (hol.days_until === 0 ? t(lang, "Hoy", "Today")
    : hol.days_until === 1 ? t(lang, "Mañana", "Tomorrow")
    : t(lang, `En ${hol.days_until} días`, `In ${hol.days_until} days`));
  // If every quick card is time-bound, the heading expires with the last of them.
  const timed = [hol?.valid_until, lot?.valid_until].filter(Boolean) as string[];
  const headingUntil = !sos && !con && timed.length ? { "data-line": "extras", "data-until": timed.sort().at(-1) } : {};

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
          <header className="hello" data-line={greeting.key} data-until={greeting.valid_until}>
            <div>
              <h1>{greeting.text}</h1>
              <p>{(tz ? `${cap(formatWeekdayDate(localDate(renderedAt, tz), lang))} · ` : "") + t(lang, "Tu resumen de hoy", "Your day at a glance")}</p>
            </div>
            <Art name={greetingArt(greeting.text)} size={60} />
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

        {(hol || sos || con || lot) && <h2 {...headingUntil}>{t(lang, "Útil para ti", "Useful for you")}</h2>}
        {hol && (
          <a className="tile holiday" href="/mas/feriados" data-line="holiday" data-until={hol.valid_until}>
            <DateBlock date={hol.date} lang={lang} />
            <span>
              <small>{`${t(lang, "Próximo feriado", "Next holiday")} ${FLAG[x!.country] ?? ""}`}</small>
              <p className="line">{hol.name}</p>
              <small>
                <span className="chip" data-line="holiday-days" data-until={dayEnd}>{soon}</span>
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
        {lot && tz && (
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
        <p id="stamp" hidden></p>
      </main>
      <TabBar current="inicio" lang={lang} />
      <script dangerouslySetInnerHTML={{ __html: OPEN_SCRIPT }} />
    </>
  );
}
