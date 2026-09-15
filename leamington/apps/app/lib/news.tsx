/**
 * Noticias (0047). Copyright stance (docs/OPEN-DECISIONS.md 3.24): Hoy shows a
 * story's headline, the publisher's own short summary (at most 300 characters),
 * our small cached copy of the publisher's picture credited "Imagen: {source}",
 * the source and the time, and links to the full story on the publisher's site
 * ("Leer en {source} ↗", a new tab, no JavaScript). Nothing here suggests the
 * whole article is in Hoy.
 *
 * A story about death or violence comes without a picture on purpose
 * (image:false): it gets the text layout, never a placeholder.
 */
import { formatTime12, localDate, type Lang } from "@leamington/shared/src/format.ts";
import { t } from "./t";
import { shortDate } from "./money";

export type NewsItem = {
  id: number; title: string; summary: string | null; url: string; source: string; source_url: string; published_at: string;
  image: boolean; thumb_w: number | null; thumb_h: number | null; lead_w: number | null; lead_h: number | null; mentions: string[];
};
export type NewsPage = {
  language: Lang; country: string; municipality: { id: number; name: string; admin_region: string } | null;
  updated_at: string | null; stale: boolean; sources: { name: string; homepage_url: string }[];
  local: NewsItem[]; region: NewsItem[]; national: NewsItem[];
};
export type NewsHome = { lead: NewsItem | null; more: NewsItem[]; updated_at: string | null; stale: boolean };

/** "hace 5 min", "hace 2 h"; older than a day, the date and time ("13 sep, 9:40pm"). Computed when the page renders. */
export function ago(iso: string, nowMs: number, lang: Lang, tz: string): string {
  const min = Math.floor((nowMs - Date.parse(iso)) / 60000);
  if (min < 60) return t(lang, `hace ${Math.max(1, min)} min`, `${Math.max(1, min)} min ago`);
  if (min < 24 * 60) return t(lang, `hace ${Math.floor(min / 60)} h`, `${Math.floor(min / 60)} h ago`);
  return `${shortDate(localDate(iso, tz), lang)}, ${formatTime12(iso, tz)}`;
}

/** The publisher's link: always a new tab, never our page. */
export const Out = ({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) => (
  <a className={className} href={href} target="_blank" rel="noopener">{children}</a>
);

/** The member's towns a local story names. */
const Towns = ({ n }: { n: NewsItem }) => n.mentions.length > 0
  ? <p className="ntowns">{n.mentions.map((m) => <span key={m} className="chip" data-town={m}>{`📍 ${m}`}</span>)}</p>
  : null;

/** A section's lead story: the picture in a fixed box, source and time, the title, the summary, the link, the credit. */
export function NewsLead({ n, lang, tz, nowMs, towns }: { n: NewsItem; lang: Lang; tz: string; nowMs: number; towns: boolean }) {
  return (
    <article className="card nlead" data-item={n.id}>
      <span className="nimg">
        <img src={`/news-image/${n.id}/lead`} width={n.lead_w ?? 480} height={n.lead_h ?? 270} alt="" decoding="async" />
      </span>
      <small className="nmeta">{`${n.source} · `}<span className="nw">{ago(n.published_at, nowMs, lang, tz)}</span></small>
      <h2 className="nt"><Out href={n.url}>{n.title}</Out></h2>
      {towns && <Towns n={n} />}
      {n.summary && <p className="nsum">{n.summary}</p>}
      <Out href={n.url} className="nread">{t(lang, `Leer en ${n.source} ↗`, `Read on ${n.source} ↗`)}</Out>
      <small className="ncr">{t(lang, `Imagen: ${n.source}`, `Image: ${n.source}`)}</small>
    </article>
  );
}

/** One more story: the thumb (or no picture at all), source and time, the title (the publisher's link, marked ↗), the towns it names, the summary folded. */
/** `compact` (team news on Fútbol): no folded summary, a "Leer en {source}" link instead. */
export function NewsRow({ n, lang, tz, nowMs, towns, compact }: { n: NewsItem; lang: Lang; tz: string; nowMs: number; towns: boolean; compact?: boolean }) {
  return (
    <article className="card nrow" data-item={n.id}>
      {n.image && <img className="nth" src={`/news-image/${n.id}/thumb`} width={n.thumb_w ?? 160} height={n.thumb_h ?? 90} alt="" loading="lazy" decoding="async" />}
      <div className="nx">
        <small className="nmeta">{`${n.source} · `}<span className="nw">{ago(n.published_at, nowMs, lang, tz)}</span></small>
        <h3 className="nt"><Out href={n.url}>{n.title}</Out></h3>
        {towns && <Towns n={n} />}
        {compact && <Out href={n.url} className="nread">{t(lang, `Leer en ${n.source} ↗`, `Read on ${n.source} ↗`)}</Out>}
        {!compact && n.summary && (
          <details className="nres">
            <summary>{t(lang, "Resumen", "Summary")}</summary>
            <p>{n.summary}</p>
          </details>
        )}
        {n.image && <small className="ncr">{t(lang, `Imagen: ${n.source}`, `Image: ${n.source}`)}</small>}
      </div>
    </article>
  );
}

/** Home's "Noticias": the lead story's picture, source and time, title and credit, then two more headlines (titles only, to keep home light). */
export function HomeNews({ news, lang, tz, nowMs }: { news: NewsHome; lang: Lang; tz: string; nowMs: number }) {
  const lead = news.lead;
  return (
    <section className="newsh">
      <div className="sh"><h2>{t(lang, "Noticias", "News")}</h2><a href="/noticias">{t(lang, "Ver todo", "See all")}</a></div>
      <div className="card nh">
        {lead && (
          <div className="nhl" data-item={lead.id}>
            <span className="nimg">
              <img src={`/news-image/${lead.id}/lead`} width={lead.lead_w ?? 480} height={lead.lead_h ?? 270} alt="" loading="lazy" decoding="async" />
            </span>
            <small className="nmeta">{`${lead.source} · `}<span className="nw">{ago(lead.published_at, nowMs, lang, tz)}</span></small>
            <b className="nt"><Out href={lead.url}>{lead.title}</Out></b>
            <small className="ncr">{t(lang, `Imagen: ${lead.source}`, `Image: ${lead.source}`)}</small>
          </div>
        )}
        {news.more.length > 0 && (
          <ul className="nmore">
            {news.more.map((m) => (
              <li key={m.id} data-item={m.id}><Out href={m.url}>{m.title}</Out></li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
