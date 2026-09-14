/**
 * Clima: official warnings first; then the weather here in Canada (Leamington
 * and Windsor); then each of their towns, home first, with its photo, today's
 * card, sunrise and sunset, and a three-day strip; then the last 30 days of
 * warnings.
 *
 * Warnings are shown verbatim: agency, level, place, issue time, source link.
 * The section never says "no warnings". When our copy is current it says when we
 * last checked the agency; when it is stale it says since when we could not,
 * and links to the agency's own page. A stale list is never shown as the list.
 *
 * Forecast days follow the home-line rules (0023, 0036): at least two providers
 * updated within 12 hours, a range when they disagree, rain probability and
 * amount only when two providers report them. A day without that is absent, and
 * a place without days is absent. Sunrise, sunset and the moon's phase are
 * computed from the place's coordinates (astronomy, not a forecast), and only
 * for places that have coordinates.
 */
import Head from "next/head";
import type { GetServerSideProps } from "next";
import { formatDate, formatTime12, formatWeekdayDate, localDate } from "@leamington/shared/src/format.ts";
import { db } from "../lib/db";
import { loadClient, recordView } from "../lib/client";
import { t } from "../lib/t";
import { OfflineBar, PageHead, TabBar } from "../lib/frame";
import { Art, Credit, FLAG, Icon, MOON, Pic, Ring, TownPhoto, dayArt, moonPhase, skyPhase, sunTimes, type Photo } from "../lib/ui";
import { AhoraCard, nowLive, type Now } from "../lib/now";
import { EXPIRE_SCRIPT } from "../lib/open-script";
import { CLIMA_CSS } from "../lib/page-css";

export const config = { unstable_runtimeJS: false };

type Alert = {
  id: number; agency: string; level: string; msg_type: string | null; event: string | null; headline: string | null;
  description: string | null; instruction: string | null; area_desc: string | null;
  issued_at: string | null; expires_at: string | null; source_url: string | null;
  cancelled_at: string | null; superseded: boolean;
};
type Day = {
  date: string; temp: string; temp_max?: number; low: number | null; rain?: boolean;
  rain_prob?: number | null; rain_mm?: number | null; text: string;
};
// "now": the weather right now (0040), or null.
type Town = {
  id: number; name: string; admin_region: string; is_home: boolean; days: Day[]; now?: Now | null;
  lat?: number | null; lng?: number | null; timezone?: string; photo?: boolean;
};
type Local = { id: number; key: string; name: string; region: string; lat: number | null; lng: number | null; timezone: string; days: Day[]; now?: Now | null };
type Weather = {
  language: "es" | "en"; timezone: string; has_home: boolean; towns: Town[]; local?: Local[];
  alerts_state: "current" | "stale" | "not_monitored"; alerts_checked_at: string | null;
  agency: string | null; agency_url: string | null;
  alerts_here: Alert[] | null; alerts_elsewhere: Alert[] | null; history: Alert[];
};
// A town's gallery (0045): photo 1 is the header; 2-6 are the strip.
type GalleryPhoto = { rank: number; author: string; license: string; license_url: string | null; source_page_url: string; width: number | null; height: number | null };
type Props = { w: Weather; country: string; today: string; now: string; photos: Photo[]; galleries: Record<string, GalleryPhoto[]> };

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  // Official warnings stay available after a paid period ends (OPEN-DECISIONS 3.6).
  const loaded = await loadClient(ctx, { allowUnpaid: true });
  if ("redirect" in loaded) return loaded;
  const { client } = loaded;
  const { rows } = await db().query("select app.weather_page($1) as w", [client.id]);
  const w = rows[0]?.w as Weather;
  const ids = w.towns.filter((town) => town.photo !== false).map((town) => town.id);
  const photos: Photo[] = ids.length
    ? (await db().query("select p from (select app.town_photo(id) as p from unnest($1::bigint[]) as id) s where p is not null", [ids]))
        .rows.map((r) => r.p)
    : [];
  const galleries: Record<string, GalleryPhoto[]> = {};
  if (ids.length) {
    for (const r of (await db().query("select id::text as id, app.town_gallery(id) as g from unnest($1::bigint[]) as id", [ids])).rows) {
      if (r.g) galleries[r.id] = r.g;
    }
  }
  await recordView(client.id, "clima", {
    alerts_state: w.alerts_state, alerts_checked_at: w.alerts_checked_at,
    alerts_here: w.alerts_here?.length ?? null, alerts_elsewhere: w.alerts_elsewhere?.length ?? null,
    has_home: w.has_home, towns: w.towns.map((town) => ({ id: town.id, days: town.days.length })),
    local: (w.local ?? []).map((p) => ({ key: p.key, days: p.days.length })),
    history: w.history.length, photos: photos.length, gallery: Object.values(galleries).reduce((n, g) => n + Math.max(0, g.length - 1), 0),
  });
  const now = new Date();
  return { props: { w, country: client.country, today: localDate(now, client.timezone), now: now.toISOString(), photos, galleries } };
};

const LEVEL: Record<string, [string, string]> = {
  red: ["Rojo", "Red"], orange: ["Naranja", "Orange"], yellow: ["Amarillo", "Yellow"], green: ["Verde", "Green"],
};
const COUNTRY: Record<string, [string, string]> = {
  MX: ["México", "Mexico"], GT: ["Guatemala", "Guatemala"], HN: ["Honduras", "Honduras"], JM: ["Jamaica", "Jamaica"],
};
const MOON_ICON = ["🌑", "🌒", "🌓", "🌔", "🌕", "🌖", "🌗", "🌘"];

/** "YYYY-MM-DD" plus n days. */
function addDays(date: string, n: number): string {
  return new Date(Date.parse(date) + n * 86_400_000).toISOString().slice(0, 10);
}

export default function Clima({ w, country, today, now, photos, galleries }: Props) {
  const lang = w.language;
  const tz = w.timezone;
  const at = new Date(now);
  const nowMs = at.getTime();
  // On a kept copy offline: warnings as current as our last check (45 minutes, or
  // this render when stale), forecasts for 3 hours, as on home.
  const alertsUntil = w.alerts_state === "current" && w.alerts_checked_at
    ? new Date(Date.parse(w.alerts_checked_at) + 45 * 60_000).toISOString()
    : new Date(nowMs + 45 * 60_000).toISOString();
  const forecastUntil = new Date(nowMs + 3 * 3_600_000).toISOString();
  const pick = (pair: [string, string] | undefined, fallback: string) => (pair ? pair[lang === "en" ? 1 : 0] : fallback);
  const moment = (iso: string) => {
    const day = localDate(iso, tz);
    return day === today ? formatTime12(iso, tz) : `${formatTime12(iso, tz)}, ${formatDate(day, lang)}`;
  };
  // Day names relative to the place's own calendar day.
  const dayName = (date: string, placeToday: string, short = false) => {
    if (date === placeToday) return t(lang, "Hoy", "Today");
    if (date === addDays(placeToday, 1)) return t(lang, "Mañana", "Tomorrow");
    const weekday = formatWeekdayDate(date, lang).split(" ")[0];
    return (weekday.charAt(0).toUpperCase() + weekday.slice(1)).slice(0, short ? 3 : undefined);
  };

  const card = (a: Alert) => (
    <div key={a.id} className={`alert ${a.level}`}>
      <span className="level">
        <span className="i"><Icon name="alert" /></span>
        {pick(LEVEL[a.level], a.level)}
        {a.msg_type === "Update" ? ` · ${t(lang, "Actualización", "Update")}` : ""}
      </span>
      <p><strong>{a.headline ?? a.event}</strong></p>
      {a.area_desc && <p>{a.area_desc}</p>}
      <p><small>
        {a.issued_at && <>{t(lang, "Emitido", "Issued")}: {moment(a.issued_at)}</>}
        {a.expires_at && <><br />{t(lang, "Vence", "Expires")}: {moment(a.expires_at)}</>}
      </small></p>
      {(a.description || a.instruction) && (
        <details>
          <summary>{t(lang, "Texto completo", "Full text")}</summary>
          {a.description && <p>{a.description}</p>}
          {a.instruction && <p>{a.instruction}</p>}
        </details>
      )}
      {a.source_url && <p><small><a href={a.source_url} rel="noopener">{t(lang, "Fuente", "Source")}: {a.agency}</a></small></p>}
    </div>
  );

  const agencyLink = w.agency_url && w.agency && (
    <p><a href={w.agency_url} rel="noopener">{t(lang, `Ver avisos de ${w.agency}`, `See ${w.agency} warnings`)}</a></p>
  );

  // Rain chance as a thin bar: only when two providers report it.
  const rainBar = (d: Day) => d.rain_prob != null && (
    <span className="rp">
      <small>{t(lang, "Lluvia", "Rain")} <b>{`${d.rain_prob}%`}</b>{d.rain_mm != null ? ` · ${d.rain_mm} mm` : ""}</small>
      <span className="bar"><i style={{ width: `${Math.min(100, Math.max(0, d.rain_prob))}%` }} /></span>
    </span>
  );
  // Today's forecast as secondary chips: the high and low with arrows, so it never reads as the temperature now.
  const highLow = (d: Day) => (
    <span className="hl">
      <b className="tp">{`↑${d.temp}`}</b>
      {d.low != null && <b className="lo">{`↓${d.low}°`}</b>}
      {d.rain && <b className="rn">{t(lang, "Lluvia", "Rain")}</b>}
    </span>
  );
  // Sunrise and sunset, computed; only with coordinates.
  const sky = (lat: number | null | undefined, lng: number | null | undefined, placeTz: string, date: string, extra?: string, small = false) => {
    if (lat == null || lng == null) return null;
    const s = sunTimes(lat, lng, date);
    if (!s) return null;
    return (
      <p className={small ? "sky sm" : "sky"}>
        <span>{`🌅 ${small ? "" : `${t(lang, "Amanecer", "Sunrise")} `}${formatTime12(s.rise, placeTz)}`}</span>
        <span>{`🌇 ${small ? "" : `${t(lang, "Atardecer", "Sunset")} `}${formatTime12(s.set, placeTz)}`}</span>
        {extra && <span>{extra}</span>}
      </p>
    );
  };
  // The days as rows with a temperature range bar across the same scale.
  const strip = (days: Day[], placeToday: string) => {
    const scaled = days.filter((d) => typeof d.temp_max === "number");
    const lo = Math.min(...scaled.map((d) => d.low ?? d.temp_max!));
    const hi = Math.max(...scaled.map((d) => d.temp_max!));
    const span = hi - lo || 1;
    return (
      <ul className="strip">
        {days.map((d) => {
          const from = d.low ?? d.temp_max;
          return (
            <li key={d.date}>
              <span>{dayName(d.date, placeToday, true)}</span>
              <Art name={dayArt(d)} size={30} lazy />
              <small className="pr">{d.rain_prob != null ? `💧${d.rain_prob}%` : ""}</small>
              <span className="lo">{d.low != null ? `${d.low}°` : ""}</span>
              <span className="rng">
                {typeof d.temp_max === "number" && from != null && (
                  <i style={{ left: `${((from - lo) / span) * 100}%`, width: `${Math.max(8, ((d.temp_max - from) / span) * 100)}%` }} />
                )}
              </span>
              <b>{d.temp}</b>
            </li>
          );
        })}
      </ul>
    );
  };

  const locals = (w.local ?? []).filter((p) => p.days.length > 0 || nowLive(p.now, nowMs));
  const towns = [...w.towns].filter((town) => town.days.length > 0 || nowLive(town.now, nowMs)).sort((a, b) => Number(b.is_home) - Number(a.is_home));
  const phase = moonPhase(at);
  // Jump pills when the page is long enough to need them.
  const jumps: [string, string][] = [
    ["#avisos", t(lang, "Avisos", "Warnings")],
    ...(locals.length ? [["#aqui", t(lang, "Canadá", "Canada")] as [string, string]] : []),
    ...towns.map((town) => [`#t${town.id}`, town.name] as [string, string]),
  ];

  return (
    <>
      <Head>
        <title>{`${t(lang, "Clima", "Weather")} · Hoy`}</title>
        <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
        <style dangerouslySetInnerHTML={{ __html: CLIMA_CSS }} />
      </Head>
      <main>
        <OfflineBar at={now} tz={tz} lang={lang} />
        <PageHead lang={lang} title={t(lang, "Clima", "Weather")} art={skyPhase(at) === "night" ? "partly-night" : "partly-day"} />
        {jumps.length > 2 && (
          <nav className="seg" aria-label={t(lang, "En esta página", "On this page")}>
            {jumps.map(([href, label]) => <a key={href} href={href}>{label}</a>)}
          </nav>
        )}

        <div id="avisos" {...(w.alerts_state === "not_monitored" ? {} : { "data-line": "alerts", "data-until": alertsUntil })}>
          <h2>{t(lang, "Avisos oficiales", "Official warnings")}</h2>
          {w.alerts_state === "current" && (
            <>
              {w.alerts_here?.map(card)}
              <div className="tile calm">
                <Pic name="clock" />
                <small>
                  {t(lang, `Revisamos los avisos de ${w.agency} a las ${moment(w.alerts_checked_at!)}.`,
                           `We checked ${w.agency} warnings at ${moment(w.alerts_checked_at!)}.`)}
                </small>
              </div>
              {w.alerts_elsewhere && w.alerts_elsewhere.length > 0 && (
                <details>
                  <summary>{t(lang, `En otras partes de ${pick(COUNTRY[country], country)}`, `Elsewhere in ${pick(COUNTRY[country], country)}`)} ({w.alerts_elsewhere.length})</summary>
                  {w.alerts_elsewhere.map(card)}
                </details>
              )}
            </>
          )}
          {w.alerts_state === "stale" && (
            <div className="tile stale">
              <Pic name="warning" />
              <span>
                <p>
                  {w.alerts_checked_at
                    ? t(lang, `No hemos podido revisar los avisos de ${w.agency} desde las ${moment(w.alerts_checked_at)}.`,
                              `We have not been able to check ${w.agency} warnings since ${moment(w.alerts_checked_at)}.`)
                    : t(lang, `No hemos podido revisar los avisos de ${w.agency}.`, `We have not been able to check ${w.agency} warnings.`)}
                </p>
                {agencyLink}
              </span>
            </div>
          )}
          {w.alerts_state === "not_monitored" && (
            <div className="tile">
              <Pic name="bell" />
              <span>
                <p>{t(lang, `Hoy todavía no recibe los avisos de ${w.agency ?? "tu país"}. Consúltalos en su página.`,
                            `Hoy does not receive ${w.agency ?? "your country's"} warnings yet. Check their page.`)}</p>
                {agencyLink}
              </span>
            </div>
          )}
        </div>

        {locals.length > 0 && (
          <section id="aqui">
            <h2>{`${t(lang, "Aquí en Canadá", "Here in Canada")} ${FLAG.CA}`}</h2>
            <div className={locals.length > 1 ? "pair" : undefined}>
              {locals.map((p) => {
                const placeToday = localDate(at, p.timezone);
                const d = p.days[0] as Day | undefined;
                const skyOf = (q: typeof p) => sky(q.lat, q.lng, q.timezone, placeToday, undefined, true);
                return (
                  <div key={p.key} className={`card here ${d?.rain ? "rain" : "sun"}`} data-lat={p.lat ?? undefined} data-line="local" data-until={forecastUntil}>
                    <b className="nm">{p.name}</b>
                    <small>{p.region}</small>
                    {/* Full width: "Ahora" beside today's forecast (stacked when narrow), then tomorrow, sunrise and sunset in one row. */}
                    <div className="hrow">
                      {nowLive(p.now, nowMs) && <AhoraCard n={p.now} lang={lang} tz={p.timezone} inside />}
                      {d && (
                        <div className="htd">
                          <span className="hn"><Art name={dayArt(d)} size={30} lazy /><small>{dayName(d.date, placeToday)}</small></span>
                          {highLow(d)}
                          {rainBar(d)}
                        </div>
                      )}
                    </div>
                    {(p.days.length > 1 || skyOf(p)) && (
                      <div className="hfoot">
                        {p.days.length > 1 && (
                          <ul className="mini">
                            {p.days.slice(1).map((x) => (
                              <li key={x.date}><small>{dayName(x.date, placeToday, true)}</small><Art name={dayArt(x)} size={24} lazy /><b>{x.temp}</b></li>
                            ))}
                          </ul>
                        )}
                        {skyOf(p)}
                      </div>
                    )}
                    {p.key === "leamington" && <a className="aquilink" href="/clima/aqui">{t(lang, "Hoy en Leamington →", "Today in Leamington →")}</a>}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {!w.has_home && (
          <a className="prompt" href="/setup/municipality">{t(lang, "Elige tu municipio para ver el clima →", "Choose your town to see the weather →")}</a>
        )}
        {towns.map((town) => {
          const photo = photos.find((p) => p.municipality_id === town.id);
          const placeTz = town.timezone ?? tz;
          const placeToday = localDate(at, placeTz);
          const d = town.days[0] as Day | undefined;
          const title = <h2>{town.name}{town.is_home && <span className="chip">{t(lang, "Tu municipio", "Your town")}</span>}</h2>;
          return (
            <section key={town.id} id={`t${town.id}`} data-lat={town.lat ?? undefined} data-line="town" data-until={forecastUntil}>
              {photo ? <div className="townhead"><TownPhoto p={photo} />{title}</div> : <div className="townhead plain">{title}</div>}
              {photo && (galleries[String(town.id)]?.length ?? 0) > 1 && (
                <div className="gal" id={`g${town.id}`}>
                  {galleries[String(town.id)].filter((g) => g.rank > 1).map((g) => (
                    <figure key={g.rank} className="gph">
                      <img src={`/photo/${town.id}/${g.rank}`} width={180} height={135} alt="" loading="lazy" decoding="async" />
                      <Credit p={{ ...g, municipality_id: town.id }} lang={lang} photoKey={`${town.id}/${g.rank}`} />
                    </figure>
                  ))}
                </div>
              )}
              {nowLive(town.now, nowMs) && <AhoraCard n={town.now} lang={lang} tz={placeTz} />}
              {d && (
                <div className={`card now ${d.rain ? "rain" : "sun"}`}>
                  <Art name={dayArt(d)} size={52} lazy />
                  <span>
                    <small><b className="dn">{dayName(d.date, placeToday)}</b>{` · ${town.admin_region}`}</small>
                    {highLow(d)}
                    {d.rain_prob != null && d.rain_mm != null && <small>{`${d.rain_mm} mm`}</small>}
                  </span>
                  {d.rain_prob != null && <Ring pct={d.rain_prob} unit={t(lang, "lluvia", "rain")} tone="rain" />}
                </div>
              )}
              {sky(town.lat, town.lng, placeTz, placeToday, town.is_home ? `${MOON_ICON[phase]} ${MOON[lang][phase]}` : undefined)}
              {/* Today is the card above; the strip carries the days after it. */}
              {town.days.length > 1 && strip(town.days.slice(1), placeToday)}
              {photo && <Credit p={photo} lang={lang} />}
            </section>
          );
        })}

        {w.history.length > 0 && (
          <details>
            <summary>{t(lang, "Avisos de los últimos 30 días", "Warnings from the last 30 days")}</summary>
            <ul className="rows">
              {w.history.map((a) => (
                <li key={a.id}>
                  <small>
                    {pick(LEVEL[a.level], a.level)} · {a.issued_at && moment(a.issued_at)} · {
                      a.cancelled_at ? t(lang, "cancelado", "cancelled")
                        : a.superseded ? t(lang, "reemplazado", "replaced")
                        : t(lang, "terminó", "ended")}
                  </small><br />
                  {a.headline ?? a.event}{a.area_desc && <><br /><small>{a.area_desc}</small></>}
                  {a.source_url && <><br /><small><a href={a.source_url} rel="noopener">{t(lang, "Fuente", "Source")}: {a.agency}</a></small></>}
                </li>
              ))}
            </ul>
          </details>
        )}
      </main>
      <TabBar current="clima" lang={lang} />
      {/* "Ahora" carries its own expiry: an open or restored page drops it once past. */}
      <script dangerouslySetInnerHTML={{ __html: EXPIRE_SCRIPT }} />
    </>
  );
}
