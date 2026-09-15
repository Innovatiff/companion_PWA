/**
 * Football videos (0049, 0050). Stance (docs/OPEN-DECISIONS.md 3.25, 3.26): links
 * to official channels' videos on YouTube with our small cached thumbnail,
 * credited "YouTube · {channel}". Never an embedded player (a player would make
 * the phone call YouTube), and the member is told once that watching opens
 * YouTube and uses a lot of data. A video without a thumbnail (not made yet, or
 * none) is a card without a picture: never a broken image.
 *
 * Shorts (is_short) link to their /shorts/ page and get a vertical card.
 * Categories come from the title at ingest: highlight, goals, interview,
 * preview, other; the card's badge says which (none for other).
 */
import type { Lang } from "@leamington/shared/src/format.ts";
import { t } from "./t";
import { ago } from "./news";

export type Category = "highlight" | "goals" | "interview" | "preview" | "other";
export type Video = {
  id: number; youtube_id: string; url: string; title: string; channel: string; published_at: string;
  views: number | null; is_highlight: boolean; category: Category; is_short: boolean;
  thumb: boolean; thumb_w: number | null; thumb_h: number | null; teams: string[];
};
export type FootballVideos = {
  language: Lang; country: string; team: { id: number; name: string } | null; league: { id: number; name: string } | null;
  updated_at: string | null; stale: boolean; channels: { name: string; url: string }[];
  team_videos: Video[]; league_videos: Video[]; shorts: Video[]; national: Video[]; national_women: Video[];
};

/** The badge of each category (none for "other"). */
export const CATEGORY: Record<Category, [string, string] | null> = {
  highlight: ["Resumen", "Highlights"], goals: ["Goles", "Goals"], interview: ["Entrevista", "Interview"], preview: ["Previa", "Preview"], other: null,
};
export const badgeOf = (v: Video, lang: Lang): string | null =>
  v.is_short ? t(lang, "Corto", "Short") : CATEGORY[v.category] ? t(lang, ...CATEGORY[v.category]!) : null;

/** A national team as members say it. */
const NATION: Record<string, [string, string]> = {
  MX: ["Selección de México", "Mexico national team"], HN: ["Selección de Honduras", "Honduras national team"],
  GT: ["Selección de Guatemala", "Guatemala national team"], JM: ["Selección de Jamaica", "Reggae Boyz, Jamaica"],
};
export const nationName = (country: string, lang: Lang) => t(lang, ...(NATION[country] ?? ["Tu selección", "Your national team"]));

/** "705 mil vistas", "5.2 mil vistas", "1.2 millones de vistas" / "705K views". */
export function viewsText(n: number, lang: Lang): string {
  if (n === 1) return t(lang, "1 vista", "1 view");
  if (lang === "en") return `${new Intl.NumberFormat("en-CA", { notation: "compact", maximumFractionDigits: 1 }).format(n)} views`;
  const one = (x: number) => new Intl.NumberFormat("es-MX", { maximumFractionDigits: x < 10 ? 1 : 0 }).format(x);
  if (n < 1000) return `${n} vistas`;
  if (n < 1_000_000) return `${one(n / 1000)} mil vistas`;
  const m = n / 1_000_000;
  return `${one(m)} ${m < 2 && one(m) === "1" ? "millón" : "millones"} de vistas`;
}

/** The plain-words note, once near the top of the videos, with a small YouTube-like mark. */
export function VideoNote({ lang }: { lang: Lang }) {
  return (
    <p className="vnote">
      <svg viewBox="0 0 24 17" width="20" height="14" aria-hidden="true"><rect width="24" height="17" rx="4.5" fill="#e62117" /><path d="M9.5 4.5v8l6.5-4z" fill="#fff" /></svg>
      {t(lang, "Se abre en YouTube · usa muchos datos", "Opens YouTube · uses a lot of data")}
    </p>
  );
}

/** Above Shorts: they are short, so they use less data. */
export const ShortsNote = ({ lang }: { lang: Lang }) => <p className="snote">{t(lang, "Cortos · usan menos datos", "Shorts · use less data")}</p>;

/**
 * One video. `big`: a full-width card (the featured video, /futbol/videos);
 * otherwise a strip or grid card. A Short is always a vertical card. The whole
 * card is the YouTube link (a new tab). Strip and grid titles are clamped (3
 * lines, 2 for Shorts); the whole title is on the big cards of /futbol/videos.
 */
export function VideoCard({ v, lang, tz, nowMs, big }: { v: Video; lang: Lang; tz: string; nowMs: number; big?: boolean }) {
  const badge = badgeOf(v, lang);
  const cls = v.is_short ? "vcard short" : big ? "card vcard big" : "vcard";
  return (
    <a className={cls} href={v.url} target="_blank" rel="noopener" data-video={v.id}>
      {v.thumb && (
        <span className="vth">
          <img src={`/video-thumb/${v.id}`} width={v.thumb_w ?? (v.is_short ? 180 : 320)} height={v.thumb_h ?? (v.is_short ? 320 : 180)} alt="" loading="lazy" decoding="async" />
          <i className="play" aria-hidden="true" />
          {badge && <b className="vbadge">{badge}</b>}
        </span>
      )}
      <span className="vb">
        {!v.thumb && badge && <b className="vbadge in">{badge}</b>}
        <b className="vt">{v.title}</b>
        {v.is_short ? (
          <small>{`YouTube · ${v.channel}`}</small>
        ) : (
          <>
            <small>{`YouTube · ${v.channel} · `}<span className="nw">{ago(v.published_at, nowMs, lang, tz)}</span></small>
            {v.views != null && <small className="vv">{viewsText(v.views, lang)}</small>}
          </>
        )}
      </span>
    </a>
  );
}
