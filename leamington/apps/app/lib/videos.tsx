/**
 * Football videos (0049). Stance (docs/OPEN-DECISIONS.md 3.25): links to official
 * channels' videos on YouTube with our small cached thumbnail, credited
 * "YouTube · {channel}". Never an embedded player (a player would make the phone
 * call YouTube), and the member is told that watching opens YouTube and uses a
 * lot of data. A video without a thumbnail (not made yet, or none) is a card
 * without a picture: never a broken image.
 */
import type { Lang } from "@leamington/shared/src/format.ts";
import { t } from "./t";
import { ago } from "./news";

export type Video = {
  id: number; youtube_id: string; url: string; title: string; channel: string; published_at: string;
  views: number | null; is_highlight: boolean; thumb: boolean; thumb_w: number | null; thumb_h: number | null; teams: string[];
};
export type FootballVideos = {
  language: Lang; team: { id: number; name: string } | null; league: { id: number; name: string } | null;
  updated_at: string | null; stale: boolean; channels: { name: string; url: string }[];
  team_videos: Video[]; league_videos: Video[];
};

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

/** The plain-words note beside every list of videos, with a small YouTube-like mark. */
export function VideoNote({ lang }: { lang: Lang }) {
  return (
    <p className="vnote">
      <svg viewBox="0 0 24 17" width="20" height="14" aria-hidden="true"><rect width="24" height="17" rx="4.5" fill="#e62117" /><path d="M9.5 4.5v8l6.5-4z" fill="#fff" /></svg>
      {t(lang, "Se abre en YouTube · usa muchos datos", "Opens YouTube · uses a lot of data")}
    </p>
  );
}

const Thumb = ({ v, lang }: { v: Video; lang: Lang }) => (
  <span className="vth">
    <img src={`/video-thumb/${v.id}`} width={v.thumb_w ?? 320} height={v.thumb_h ?? 180} alt="" loading="lazy" decoding="async" />
    <i className="play" aria-hidden="true" />
    {v.is_highlight && <b className="vbadge">{t(lang, "Resumen", "Highlights")}</b>}
  </span>
);

/**
 * One video. `big`: the videos page's full-width card; otherwise a strip card.
 * The whole card is the YouTube link (a new tab). The title has up to 3 lines in
 * a strip card (clamped; the link's title attribute carries it whole).
 */
export function VideoCard({ v, lang, tz, nowMs, big }: { v: Video; lang: Lang; tz: string; nowMs: number; big?: boolean }) {
  return (
    <a className={big ? "card vcard big" : "vcard"} href={v.url} target="_blank" rel="noopener" title={v.title} data-video={v.id}>
      {v.thumb && <Thumb v={v} lang={lang} />}
      <span className="vb">
        {!v.thumb && v.is_highlight && <b className="vbadge in">{t(lang, "Resumen", "Highlights")}</b>}
        <b className="vt">{v.title}</b>
        <small>{`YouTube · ${v.channel} · `}<span className="nw">{ago(v.published_at, nowMs, lang, tz)}</span></small>
        {v.views != null && <small className="vv">{viewsText(v.views, lang)}</small>}
      </span>
    </a>
  );
}
