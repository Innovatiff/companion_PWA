/**
 * Hoy's bottom tab bar: 4 items, icon + label, never icon-only. Plain <a> links,
 * no client router. Icons are inline SVG strokes in currentColor (under 1 KB).
 */
export type Tab = "inicio" | "futbol" | "clima" | "mas";
export type Lang = "es" | "en";

const TABS: Tab[] = ["inicio", "futbol", "clima", "mas"];
const HREF: Record<Tab, string> = { inicio: "/", futbol: "/futbol", clima: "/clima", mas: "/mas" };
const LABEL: Record<Lang, Record<Tab, string>> = {
  es: { inicio: "Inicio", futbol: "Fútbol", clima: "Clima", mas: "Más" },
  en: { inicio: "Home", futbol: "Football", clima: "Weather", mas: "More" },
};

function Icon({ tab }: { tab: Tab }) {
  switch (tab) {
    case "inicio":
      return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11 12 3l9 8M5 10v10h5v-6h4v6h5V10" /></svg>;
    case "futbol":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="m12 7 4 3-1.5 4.5h-5L8 10zM12 3v4M16 10l4.5-1.5M14.5 14.5l2.5 4M9.5 14.5 7 18.5M8 10 3.5 8.5" />
        </svg>
      );
    case "clima":
      return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 11a3.5 3.5 0 0 0 1 7z" /></svg>;
    case "mas":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" />
        </svg>
      );
  }
}

export function TabBar({ current, lang }: { current: Tab; lang: Lang }) {
  return (
    <nav className="tabs" aria-label={lang === "en" ? "Sections" : "Secciones"}>
      {TABS.map((tab) => (
        <a key={tab} href={HREF[tab]} aria-current={tab === current ? "page" : undefined}>
          <Icon tab={tab} />
          <span>{LABEL[lang][tab]}</span>
        </a>
      ))}
    </nav>
  );
}
