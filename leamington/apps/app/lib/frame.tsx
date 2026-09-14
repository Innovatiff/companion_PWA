/**
 * Hoy's frame (docs/DESIGN.md section 10): the bottom tab bar, the home header
 * and the section page header. Plain links and inline stroke icons; no client
 * JS. Illustrations are cached files from /art (see lib/ui.tsx, Art).
 */
import { formatTime12, type Lang } from "@leamington/shared/src/format.ts";
import { t } from "./t";
import { Art, type ArtName } from "./ui";

export type Tab = "inicio" | "futbol" | "clima" | "tasa" | "mas";

const TABS: Tab[] = ["inicio", "futbol", "clima", "tasa", "mas"];
const HREF: Record<Tab, string> = { inicio: "/", futbol: "/futbol", clima: "/clima", tasa: "/mas/tasa", mas: "/mas" };
const LABEL: Record<Lang, Record<Tab, string>> = {
  es: { inicio: "Inicio", futbol: "Fútbol", clima: "Clima", tasa: "Tasa", mas: "Más" },
  en: { inicio: "Home", futbol: "Football", clima: "Weather", tasa: "Rate", mas: "More" },
};
// Outline icons on a 24px grid, drawn in currentColor.
const PATH: Record<Tab, string> = {
  inicio: '<path d="M3 11 12 3l9 8M5 10v10h5v-6h4v6h5V10"/>',
  futbol: '<circle cx="12" cy="12" r="9"/><path d="m12 7 4 3-1.5 4.5h-5L8 10zM12 3v4M16 10l4.5-1.5M14.5 14.5l2.5 4M9.5 14.5 7 18.5M8 10 3.5 8.5"/>',
  clima: '<path d="M8 20h9a4 4 0 0 0 .6-8A6 6 0 0 0 6.3 13 3.5 3.5 0 0 0 8 20z"/><path d="M8 3v1.5M3 8h1.5M4.5 4.5l1 1M11.5 4.5l-1 1M5.2 10.5A3.5 3.5 0 0 1 11 6"/>',
  tasa: '<path d="M4 8h14l-3.5-3.5M20 16H6l3.5 3.5"/>',
  mas: '<rect x="4" y="4" width="6.5" height="6.5" rx="2"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="2"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="2"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="2"/>',
};

const Svg = ({ d }: { d: string }) => <svg viewBox="0 0 24 24" aria-hidden="true" dangerouslySetInnerHTML={{ __html: d }} />;

/**
 * Five items, icon + label, never icon-only: Inicio · Fútbol · Clima (a raised
 * round button in the centre) · Tasa · Más.
 */
export function TabBar({ current, lang }: { current: Tab; lang: Lang }) {
  return (
    <nav className="tabs" aria-label={t(lang, "Secciones", "Sections")}>
      {TABS.map((tab) => (
        <a key={tab} href={HREF[tab]} className={tab === "clima" ? "c" : undefined} aria-current={tab === current ? "page" : undefined}>
          {tab === "clima" ? <span className="fab"><Svg d={PATH[tab]} /></span> : <Svg d={PATH[tab]} />}
          <span>{LABEL[lang][tab]}</span>
        </a>
      ))}
    </nav>
  );
}

/**
 * "Sin conexión · guardado a las 10:32am": rendered hidden with the page's own
 * render time; the service worker reveals it only on a kept copy served offline.
 */
export function OfflineBar({ at, tz, lang }: { at: string; tz: string; lang: Lang }) {
  return (
    <p id="off" className="offbar" role="status" hidden>
      {t(lang, `Sin conexión · guardado a las ${formatTime12(at, tz)}`, `Offline · saved at ${formatTime12(at, tz)}`)}
    </p>
  );
}

/** "Carlos Mejía" -> "CM"; "Test Client (Montego Bay)" -> "TC". */
export function initialsOf(name: string): string {
  const words = name.replace(/\(.*?\)/g, " ").split(/\s+/).filter((w) => /\p{L}/u.test(w));
  return words.slice(0, 2).map((w) => (/\p{L}/u.exec(w)?.[0] ?? "").toUpperCase()).join("");
}

/**
 * Home's top row: the member's initials, the "Miembro" pill, and a bell that
 * opens Clima's official warnings. The bell's dot shows only while our current
 * copy of the official warnings has at least one for their town; without that it
 * is just a bell, never a sign of calm. The dot carries its own expiry.
 */
export function HomeTop({ lang, name, warnings, until }: { lang: Lang; name: string; warnings: number; until: string | null }) {
  const dot = warnings > 0 && until;
  return (
    <div className="top">
      <span className="av" aria-hidden="true">{initialsOf(name)}</span>
      <a className="member" href="/mas/miembro"><b aria-hidden="true">✦</b>{t(lang, "Miembro", "Member")}</a>
      <a className="bellbtn" href="/clima#avisos"
         aria-label={dot ? t(lang, `Avisos oficiales (${warnings})`, `Official warnings (${warnings})`) : t(lang, "Avisos oficiales", "Official warnings")}>
        <Svg d='<path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>' />
        {dot && <i className="dot" data-line="bell" data-until={until} />}
      </a>
    </div>
  );
}

/**
 * A section page's header: a round back button (section pages under Más), the
 * title, and its picture.
 */
export function PageHead({ lang, title, art, back }: { lang: Lang; title: string; art: ArtName; back?: boolean | "/clima" }) {
  return (
    <header className={back ? "ph" : "ph tab"}>
      {back && (
        <a className="back" href={back === "/clima" ? "/clima" : "/mas"}
           aria-label={back === "/clima" ? t(lang, "Volver a Clima", "Back to Weather") : t(lang, "Volver a Más", "Back to More")}>
          <Svg d='<path d="M15 5l-7 7 7 7"/>' />
        </a>
      )}
      <h1>{title}</h1>
      <Art name={art} size={52} />
    </header>
  );
}
