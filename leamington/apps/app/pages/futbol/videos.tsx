/**
 * Videos (0049, app.football_videos): their team's videos (30 days, highlights
 * first) and their league's highlights (7 days), one column of big cards that
 * link to YouTube. Stance (docs/OPEN-DECISIONS.md 3.25): our cached thumbnail,
 * "YouTube · {channel}", never a player, and the note that watching opens
 * YouTube and uses a lot of data. A tab without videos is not shown; never
 * "no videos". When the feed has not answered within 3 hours: when it last did,
 * and that the list may not be current.
 */
import Head from "next/head";
import type { GetServerSideProps } from "next";
import { formatTime12 } from "@leamington/shared/src/format.ts";
import { db } from "../../lib/db";
import { loadClient, recordView } from "../../lib/client";
import { t } from "../../lib/t";
import { OfflineBar, PageHead, TabBar } from "../../lib/frame";
import { VideoCard, VideoNote, type FootballVideos } from "../../lib/videos";
import { VIDEOS_CSS } from "../../lib/page-css";

export const config = { unstable_runtimeJS: false };

/** Videos per tab: the page stays within its budget. */
export const VIDEOS_LIMIT = 12;
const SECTIONS = ["team", "league"] as const;
type Section = (typeof SECTIONS)[number];
type Props = { lang: "es" | "en"; tz: string; fv: FootballVideos | null; section: Section | null; renderedAt: string };

const listOf = (fv: FootballVideos | null, s: Section) => (s === "team" ? fv?.team_videos : fv?.league_videos) ?? [];

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const loaded = await loadClient(ctx);
  if ("redirect" in loaded) return loaded;
  const { client } = loaded;
  const fv = ((await db().query("select app.football_videos($1, now(), $2) as v", [client.id, VIDEOS_LIMIT])).rows[0]?.v ?? null) as FootballVideos | null;
  const asked = SECTIONS.find((s) => s === ctx.query.s);
  const section = asked && listOf(fv, asked).length > 0 ? asked : SECTIONS.find((s) => listOf(fv, s).length > 0) ?? null;
  await recordView(client.id, "futbol_videos", {
    section, team: fv?.team_videos.length ?? null, league: fv?.league_videos.length ?? null, stale: fv?.stale ?? null,
  });
  return { props: { lang: client.language, tz: client.timezone, fv, section, renderedAt: new Date().toISOString() } };
};

export default function Videos({ lang, tz, fv, section, renderedAt }: Props) {
  const nowMs = Date.parse(renderedAt);
  const tabs = SECTIONS.filter((s) => listOf(fv, s).length > 0);
  const updated = fv?.updated_at ? formatTime12(fv.updated_at, tz) : null;
  const label = (s: Section) => (s === "team" ? fv?.team?.name : fv?.league?.name) ?? (s === "team" ? t(lang, "Tu equipo", "Your team") : t(lang, "Tu liga", "Your league"));
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
            {tabs.map((s) => <a key={s} href={s === "team" ? "/futbol/videos" : "/futbol/videos?s=league"} data-section={s} aria-current={s === section ? "page" : undefined}>{label(s)}</a>)}
          </nav>
        )}
        {section && (
          <section data-videos={section}>
            <VideoNote lang={lang} />
            {listOf(fv, section).map((v) => <VideoCard key={v.id} v={v} lang={lang} tz={tz} nowMs={nowMs} big />)}
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
