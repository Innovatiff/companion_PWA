/**
 * Videos (0049, 0050, app.football_videos): tabs for their team's videos, their
 * league's highlights, Shorts, their national team, and the women's national
 * team when there are any. The team tab filters by category (Todos · Resúmenes ·
 * Goles · Entrevistas; only categories present). Big cards, and Shorts in a
 * two-column grid of vertical cards, all linking to YouTube.
 *
 * Stance (docs/OPEN-DECISIONS.md 3.25, 3.26): our cached thumbnail, "YouTube ·
 * {channel}", never a player, and the note (once) that watching opens YouTube
 * and uses a lot of data. A tab without videos is not shown; never "no videos".
 * When the feed has not answered within 3 hours: when it last did, and that the
 * list may not be current.
 */
import Head from "next/head";
import type { GetServerSideProps } from "next";
import { formatTime12 } from "@leamington/shared/src/format.ts";
import { db } from "../../lib/db";
import { loadClient, recordView } from "../../lib/client";
import { t } from "../../lib/t";
import { OfflineBar, PageHead, TabBar } from "../../lib/frame";
import { ShortsNote, VideoCard, VideoNote, type Category, type FootballVideos } from "../../lib/videos";
import { VIDEOS_CSS } from "../../lib/page-css";

export const config = { unstable_runtimeJS: false };

/** Videos per tab: the page stays within its budget. */
export const VIDEOS_LIMIT = 12;
const SECTIONS = ["team", "league", "shorts", "national", "women"] as const;
type Section = (typeof SECTIONS)[number];
const FILTERS = ["highlight", "goals", "interview"] as const;
type Filter = (typeof FILTERS)[number];
type Props = { lang: "es" | "en"; tz: string; fv: FootballVideos | null; section: Section | null; filter: Filter | null; renderedAt: string };

const listOf = (fv: FootballVideos | null, s: Section) =>
  (s === "team" ? fv?.team_videos : s === "league" ? fv?.league_videos : s === "shorts" ? fv?.shorts : s === "national" ? fv?.national : fv?.national_women) ?? [];

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const loaded = await loadClient(ctx);
  if ("redirect" in loaded) return loaded;
  const { client } = loaded;
  const fv = ((await db().query("select app.football_videos($1, now(), $2) as v", [client.id, VIDEOS_LIMIT])).rows[0]?.v ?? null) as FootballVideos | null;
  const asked = SECTIONS.find((s) => s === ctx.query.s);
  const section = asked && listOf(fv, asked).length > 0 ? asked : SECTIONS.find((s) => listOf(fv, s).length > 0) ?? null;
  const filter = section === "team" ? FILTERS.find((c) => c === ctx.query.f && listOf(fv, "team").some((v) => v.category === c)) ?? null : null;
  await recordView(client.id, "futbol_videos", {
    section, filter, team: fv?.team_videos.length ?? null, league: fv?.league_videos.length ?? null, shorts: fv?.shorts.length ?? null,
    national: fv?.national.length ?? null, women: fv?.national_women.length ?? null, stale: fv?.stale ?? null,
  });
  return { props: { lang: client.language, tz: client.timezone, fv, section, filter, renderedAt: new Date().toISOString() } };
};

const FILTER_LABEL: Record<Filter | "all", [string, string]> = {
  all: ["Todos", "All"], highlight: ["Resúmenes", "Highlights"], goals: ["Goles", "Goals"], interview: ["Entrevistas", "Interviews"],
};

export default function Videos({ lang, tz, fv, section, filter, renderedAt }: Props) {
  const nowMs = Date.parse(renderedAt);
  const tabs = SECTIONS.filter((s) => listOf(fv, s).length > 0);
  const updated = fv?.updated_at ? formatTime12(fv.updated_at, tz) : null;
  const label = (s: Section) =>
    s === "team" ? fv?.team?.name ?? t(lang, "Tu equipo", "Your team")
      : s === "league" ? t(lang, "Liga", "League")
      : s === "shorts" ? t(lang, "Cortos", "Shorts")
      : s === "national" ? t(lang, "Selección", "National team")
      : t(lang, "Femenil", "Women");
  const cats: Filter[] = section === "team" ? FILTERS.filter((c) => listOf(fv, "team").some((v) => v.category === c)) : [];
  const list = section ? listOf(fv, section).filter((v) => !filter || v.category === (filter as Category)) : [];
  return (
    <>
      <Head>
        <title>{`${t(lang, "Videos", "Videos")} · Hoy`}</title>
        <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
        <style dangerouslySetInnerHTML={{ __html: VIDEOS_CSS }} />
      </Head>
      <main>
        <OfflineBar at={renderedAt} tz={tz} lang={lang} />
        <PageHead lang={lang} title={t(lang, "Videos", "Videos")} art="football" back="/futbol" />
        {fv?.stale ? (
          <p className="stale" data-stale="">
            {updated
              ? t(lang, `Actualizado a las ${updated}. La lista puede no estar al día.`, `Updated at ${updated}. The list may not be up to date.`)
              : t(lang, "Todavía no hemos podido actualizar los videos. La lista puede no estar al día.", "We have not been able to update the videos yet. The list may not be up to date.")}
          </p>
        ) : updated && (
          <p className="nupd"><small>{t(lang, `Actualizado a las ${updated}`, `Updated at ${updated}`)}</small></p>
        )}
        {tabs.length > 0 && (
          <nav className="seg" aria-label={t(lang, "Secciones", "Sections")}>
            {tabs.map((s) => (
              <a key={s} href={s === "team" ? "/futbol/videos" : `/futbol/videos?s=${s}`} data-section={s} aria-current={s === section ? "page" : undefined}>{label(s)}</a>
            ))}
          </nav>
        )}
        {section && <VideoNote lang={lang} />}
        {cats.length > 0 && (
          <nav className="cats" aria-label={t(lang, "Tipo de video", "Kind of video")}>
            {([null, ...cats] as (Filter | null)[]).map((c) => (
              <a key={c ?? "all"} href={c ? `/futbol/videos?f=${c}` : "/futbol/videos"} data-filter={c ?? "all"} aria-current={c === filter ? "page" : undefined}>
                {t(lang, ...FILTER_LABEL[c ?? "all"])}
              </a>
            ))}
          </nav>
        )}
        {section && (
          <section data-videos={section}>
            {section === "shorts" ? (
              <>
                <ShortsNote lang={lang} />
                <div className="vgrid">{list.map((v) => <VideoCard key={v.id} v={v} lang={lang} tz={tz} nowMs={nowMs} />)}</div>
              </>
            ) : (
              list.map((v) => <VideoCard key={v.id} v={v} lang={lang} tz={tz} nowMs={nowMs} big />)
            )}
          </section>
        )}
        {fv && fv.channels.length > 0 && (
          <p className="vsrc">
            <small>
              {t(lang, "Canales: ", "Channels: ")}
              {fv.channels.map((c, i) => <span key={c.url}>{i > 0 ? " · " : ""}<a href={c.url} target="_blank" rel="noopener">{c.name}</a></span>)}
            </small>
          </p>
        )}
      </main>
      <TabBar current="futbol" lang={lang} />
    </>
  );
}
