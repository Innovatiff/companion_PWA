/**
 * Round 2, "Tú eres Hoy" (0041): the member card, badges, the season ring, the
 * home badge row, "Allá y aquí" and the one-time welcome screen.
 *
 * Every value comes from app.member_card, app.member_badges,
 * app.season_progress and app.home_more; nothing is estimated. Each badge's
 * how-to-earn line says exactly what 0041 counts. Days never go below zero
 * (0041 guarantees it); a past date is said in words, never as a number.
 */
import Head from "next/head";
import type { CSSProperties, ReactNode } from "react";
import { formatCode } from "@leamington/shared/src/code.ts";
import { formatDate, formatTime12, localDate, type Lang } from "@leamington/shared/src/format.ts";
import { t } from "./t";
import type { Now } from "./now";
import { Art, Credit, LEAMINGTON, Num, Pic, TownPhoto, sunTimes, type ArtName, type Photo, type SkyPhase } from "./ui";
import { WELCOME_CSS } from "./page-css";

export type MemberCard = {
  full_name: string; first_name: string; code: string; member_since: string; valid_until: string | null;
  status: "active" | "due" | "lapsed" | "none"; business: string | null; country: string; municipality: string | null;
  language: Lang; member_number: number | null; renewals: number; founder: boolean;
};
export type Badge = { key: string; earned: boolean; earned_at: string | null; progress: { n: number; of: number } | null };
export type Season =
  | { kind: "season"; arrival: string; departure: string; days_total: number; days_done: number; days_left: number; pct: number; past: boolean }
  | { kind: "countdown"; departure: string; days_left: number; past: boolean }
  | { kind: "trip"; next_trip: string; days_left: number; past: boolean };

const style = (p: number) => ({ "--p": Math.min(100, Math.max(0, p)) }) as CSSProperties;
const days = (lang: Lang, n: number) => (n === 1 ? t(lang, "día", "day") : t(lang, "días", "days"));

// ---------------------------------------------------------------------------
// Member card
// ---------------------------------------------------------------------------
const STATUS: Record<string, [string, string]> = {
  due: ["Vence pronto", "Ends soon"], lapsed: ["Vencida", "Ended"], none: ["Sin periodo pagado", "No paid period"],
};

/** A premium card: the mark, crown, founder ribbon, name, member number, code, and dates. */
export function MemberCardView({ m, lang }: { m: MemberCard; lang: Lang }) {
  return (
    <section className="mcard" data-status={m.status}>
      <div className="mtop">
        <span className="mark">{"Hoy "}<b aria-hidden="true">✦</b>{` ${t(lang, "Miembro", "Member")}`}</span>
        {m.founder && <span className="ribbon">{t(lang, "★ Fundador 2026", "★ Founder 2026")}</span>}
        <Art name="crown" size={44} />
      </div>
      <p className="mname">{m.full_name}</p>
      {m.member_number != null && <p className="mnum">{t(lang, `Miembro #${m.member_number}`, `Member #${m.member_number}`)}</p>}
      <p className="mcode">{formatCode(m.code)}</p>
      <div className="mfoot">
        <span><small>{t(lang, "Desde", "Since")}</small><time dateTime={m.member_since}>{formatDate(m.member_since, lang, true)}</time></span>
        {m.valid_until && (
          <span className="mvalid"><small>{t(lang, "Vigente hasta", "Valid until")}</small><time dateTime={m.valid_until}>{formatDate(m.valid_until, lang, true)}</time></span>
        )}
      </div>
      {m.status !== "active" && STATUS[m.status] && <span className="chip mst">{t(lang, ...STATUS[m.status])}</span>}
    </section>
  );
}

/** Who registered them, renewals, and where renewal works. */
export function MemberFacts({ m, lang }: { m: MemberCard; lang: Lang }) {
  return (
    <ul className="mfacts">
      {m.business && (
        <li className="mbiz"><Pic name="pin" /><span><small>{t(lang, "Te registró", "Registered by")}</small><b>{m.business}</b></span></li>
      )}
      {m.renewals > 0 && (
        <li data-renewals={m.renewals}><Pic name="badge-renovo" /><span><small>{t(lang, "Renovaciones", "Renewals")}</small><b>{String(m.renewals)}</b></span></li>
      )}
      <li><Pic name="money" /><span>{t(lang, "Puedes renovar en cualquier negocio de Hoy.", "You can renew at any Hoy business.")}</span></li>
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Badges: names, pictures, and how each is earned, word for word with 0041
// ---------------------------------------------------------------------------
const BADGE: Record<string, { art: ArtName; name: [string, string]; how: [string, string] }> = {
  // member since before 2026-11-01
  fundador: { art: "badge-fundador", name: ["Fundador", "Founder"],
    how: ["Para miembros desde antes del 1 de noviembre de 2026", "For members since before 1 November 2026"] },
  // their hometown is set
  pueblo: { art: "badge-pueblo", name: ["Mi pueblo", "Hometown"], how: ["Elige tu municipio", "Choose your town"] },
  // a phone of theirs receives notifications now
  avisos: { art: "badge-avisos", name: ["Avisos", "Alerts"], how: ["Activa las notificaciones", "Turn on notifications"] },
  // watches at least one more town
  vigia: { art: "badge-vigia", name: ["Vigía", "Lookout"], how: ["Agrega otro municipio", "Add another town"] },
  // 5 different section pages (not setup, not the expiry screen)
  explorador: { art: "badge-explorador", name: ["Explorador", "Explorer"], how: ["Abre 5 secciones distintas", "Open 5 different sections"] },
  // Hoy opened on 7 different days
  fiel: { art: "badge-fiel", name: ["Fiel", "Loyal"], how: ["Abre Hoy 7 días distintos", "Open Hoy on 7 different days"] },
  // a paid renewal
  renovo: { art: "badge-renovo", name: ["Renovó", "Renewed"], how: ["Renueva tu plan", "Renew your plan"] },
  // the departure day reached with a paid period covering it (needs arrival and departure on record)
  temporada: { art: "badge-temporada", name: ["Temporada", "Season"],
    how: ["Llega a tu día de regreso con tu plan vigente", "Reach your going-home day with your plan active"] },
};

/** Temporada without a season on record: how to make it decidable, or who it is for. */
const temporadaHow = (lang: Lang, seasonal: boolean) => seasonal
  ? t(lang, "Anota tu llegada y tu regreso", "Add your arrival and going-home dates")
  : t(lang, "Para quien viene por temporada", "For seasonal workers");

export function BadgeGrid({ badges, lang, seasonal }: { badges: Badge[]; lang: Lang; seasonal: boolean }) {
  return (
    <ul className="badges">
      {badges.map((b) => {
        const meta = BADGE[b.key];
        if (!meta) return null;
        return (
          <li key={b.key} className={b.earned ? "badge on" : "badge off"} data-key={b.key}>
            <span className="bt">
              <Art name={meta.art} size={64} lazy />
              {!b.earned && b.progress && (
                <span className="ring sm" style={style(b.progress.of ? (b.progress.n * 100) / b.progress.of : 0)}>
                  <span><b>{`${b.progress.n}/${b.progress.of}`}</b></span>
                </span>
              )}
            </span>
            <b>{t(lang, ...meta.name)}</b>
            {b.earned
              ? b.earned_at && <small>{`${t(lang, "Ganada", "Earned")} `}<time dateTime={b.earned_at}>{formatDate(b.earned_at, lang)}</time></small>
              : <small>{b.key === "temporada" && !b.progress ? temporadaHow(lang, seasonal) : t(lang, ...meta.how)}</small>}
          </li>
        );
      })}
    </ul>
  );
}

/** Home: the badges as one row, a crown, "3 de 8" and a thin bar, to the member page. */
export function BadgesRow({ earned, total, lang, until }: { earned: number; total: number; lang: Lang; until: string }) {
  return (
    <a className="tile brow" href="/mas/miembro" data-line="badges" data-until={until}>
      <Pic name="crown" />
      <span className="tx">
        <small>{t(lang, "Insignias", "Badges")}</small>
        <span className="nb"><Num value={String(earned)} /><em>{t(lang, `de ${total}`, `of ${total}`)}</em></span>
        <span className="bar"><i style={{ width: `${total ? (earned * 100) / total : 0}%` }} /></span>
      </span>
    </a>
  );
}

// ---------------------------------------------------------------------------
// Season ring (home)
// ---------------------------------------------------------------------------
/**
 * season: the season's percentage big, a ring with the days left. countdown:
 * the days to going home big, an empty ring with a plane (no arrival on record,
 * so no share of the season is claimed) and a link to add it. trip: a plane and
 * the days to the trip. Past dates are said in words.
 */
export function SeasonCard({ s, lang, until }: { s: Season; lang: Lang; until: string }) {
  const date = (d: string) => formatDate(d, lang);
  let label: string, body: ReactNode, sub: ReactNode, side: ReactNode;
  if (s.kind === "season") {
    label = t(lang, "Tu temporada", "Your season");
    body = <p className="sbig"><Num value={String(s.pct)} /><em className="pc">%</em></p>;
    sub = <small>{s.past
      ? t(lang, `Terminó el ${date(s.departure)}`, `Ended on ${date(s.departure)}`)
      : t(lang, `Llegaste el ${date(s.arrival)} · regresas el ${date(s.departure)}`, `Arrived ${date(s.arrival)} · home ${date(s.departure)}`)}</small>;
    side = (
      <span className="sring"><i style={style(s.pct)} />
        {s.past ? <span><b>✓</b></span>
          : s.days_left === 0 ? <span><b>{t(lang, "Hoy", "Today")}</b></span>
          : <span><Num value={String(s.days_left)} /><small>{days(lang, s.days_left)}</small></span>}
      </span>
    );
  } else if (s.kind === "countdown") {
    label = t(lang, "Tu regreso", "Going home");
    body = s.past ? <p className="sbig sm">{t(lang, `Era el ${date(s.departure)}`, `It was on ${date(s.departure)}`)}</p>
      : s.days_left === 0 ? <p className="sbig">{t(lang, "Hoy", "Today")}</p>
      : <p className="sbig"><Num value={String(s.days_left)} /><em>{days(lang, s.days_left)}</em></p>;
    sub = !s.past && (
      <small>{t(lang, `Regresas el ${date(s.departure)}`, `Home on ${date(s.departure)}`)}{" · "}
        <a href="/mas#llegada">{t(lang, "Anota tu llegada", "Add your arrival")}</a></small>
    );
    side = <span className="sring"><i style={style(0)} /><Art name="plane" size={56} /></span>;
  } else {
    label = t(lang, "Tu viaje", "Your trip");
    body = s.past ? <p className="sbig sm">{t(lang, `Fue el ${date(s.next_trip)}`, `It was on ${date(s.next_trip)}`)}</p>
      : s.days_left === 0 ? <p className="sbig">{t(lang, "Hoy", "Today")}</p>
      : <p className="sbig"><Num value={String(s.days_left)} /><em>{days(lang, s.days_left)}</em></p>;
    sub = !s.past && <small>{t(lang, `El ${date(s.next_trip)}`, `On ${date(s.next_trip)}`)}</small>;
    side = <Art name="plane" size={96} />;
  }
  return (
    <section className="season" data-line="season" data-until={until} data-kind={s.kind}>
      <div><span className="lbl">{label}</span>{body}{sub}</div>
      {side}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Allá y aquí (home)
// ---------------------------------------------------------------------------
/** A timezone's UTC offset in minutes at a moment. */
function offsetMinutes(timeZone: string, at: Date): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" }).formatToParts(at)
    .find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const m = /GMT([+-])(\d{2}):?(\d{2})?/.exec(name);
  return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0)) : 0;
}

type Place = { key: "home" | "leam"; name: string; tz: string; lat: number | null; lng: number | null; now: Now | null };

/**
 * Two halves: their hometown and Leamington, each with the local time (the
 * server's render time, so the card carries a 15-minute validity), a day or
 * night picture from sunrise and sunset, and the temperature now only with
 * "Ahora" data. Between them, the time difference.
 */
export function AllaAqui({ lang, at, home, leamNow, until }: { lang: Lang; at: string; home: Omit<Place, "key">; leamNow: Now | null; until: string }) {
  const when = new Date(at);
  const places: Place[] = [
    { key: "home", ...home },
    { key: "leam", name: "Leamington", tz: LEAMINGTON.timezone, lat: LEAMINGTON.lat, lng: LEAMINGTON.lng, now: leamNow },
  ];
  const diff = offsetMinutes(home.tz, when) - offsetMinutes(LEAMINGTON.timezone, when);
  const hours = Math.abs(diff) / 60;
  const h = `${Number.isInteger(hours) ? hours : hours.toFixed(1)} h`;
  const difference = diff === 0 ? t(lang, "Misma hora", "Same time")
    : diff < 0 ? t(lang, `Allá: ${h} menos`, `There: ${h} behind`) : t(lang, `Allá: ${h} más`, `There: ${h} ahead`);
  const half = (p: Place) => {
    const s = p.lat != null && p.lng != null ? sunTimes(p.lat, p.lng, localDate(when, p.tz)) : null;
    const day = s ? when > s.rise && when < s.set : null;
    return (
      <div className="ah" data-place={p.key}>
        {day != null && <Art name={day ? "sun" : "moon"} size={44} lazy />}
        <small>{p.name}</small>
        <b className="clk">{formatTime12(when, p.tz)}</b>
        {p.now && <span className="nowt" data-line={`alla-${p.key}-now`} data-until={p.now.valid_until}>{p.now.temp}</span>}
      </div>
    );
  };
  return (
    <section className="alla" data-line="alla" data-until={until}>
      <header><Art name="globe" size={32} lazy />{t(lang, "Allá y aquí", "There and here")}</header>
      <div className="ah2">
        {half(places[0])}
        <span className="dif">{difference}</span>
        {half(places[1])}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Welcome (once)
// ---------------------------------------------------------------------------
/**
 * The first open after setup: their hometown photo full-bleed (with its credit),
 * or Leamington's live sky; a white card with a wave, the welcome, and a big
 * round arrow. Both the arrow and "Saltar" post to /api/welcome. No JS.
 */
export function WelcomeScreen({ lang, first, member, photo, place, sky }: {
  lang: Lang; first: string; member: MemberCard | null; photo: Photo | null; place: string | null; sky: SkyPhase;
}) {
  const facts = [member?.member_number != null ? t(lang, `Miembro #${member.member_number}`, `Member #${member.member_number}`) : null,
    member?.founder ? t(lang, "Fundador", "Founder") : null].filter(Boolean).join(" · ");
  return (
    <>
      <Head>
        <title>Hoy</title>
        <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
        <style dangerouslySetInnerHTML={{ __html: WELCOME_CSS }} />
      </Head>
      <main className={`welcome s-${sky}${photo ? " wp" : ""}`} data-lang={lang}>
        {photo && <TownPhoto p={photo} lazy={false} className="wbg" />}
        <div className="wtop">{photo && <Credit p={photo} lang={lang} place={place ?? undefined} licenseFirst />}</div>
        <section className="wcard">
          <Art name="wave" size={64} />
          <h1>{t(lang, `Te damos la bienvenida a Hoy, ${first}`, `Welcome to Hoy, ${first}`)}</h1>
          <p>{facts || t(lang, "Tu día en un vistazo", "Your day at a glance")}</p>
          <form method="post" action="/api/welcome" className="wgo">
            <button type="submit" name="skip" value="1" className="wskip">{t(lang, "Saltar", "Skip")}</button>
            <button type="submit" className="go" aria-label={t(lang, "Entrar a Hoy", "Open Hoy")}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </button>
          </form>
        </section>
      </main>
    </>
  );
}
