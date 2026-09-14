/**
 * Noticias (0047, app.news_page): news of the member's country, their region's
 * outlets, and stories that name their hometown or a town they watch.
 *
 * Copyright stance (docs/OPEN-DECISIONS.md 3.24): the headline, the publisher's
 * own short summary, our cached copy of the publisher's picture credited
 * "Imagen: {source}", the source and the time, and "Leer en {source} ↗" to the
 * full story on the publisher's site. Zero JavaScript.
 *
 *   Tabs     their municipio (local; "Mis pueblos" when watched towns are in it), their state or department (region), their
 *            country (national); only sections with stories; the first with
 *            stories is the default.
 *   Lead     the section's first story with a picture, big.
 *   The rest compact cards, a thumb or no picture (graphic stories come without
 *            one on purpose, and get no placeholder), the summary folded.
 *   Stale    when the feed has not answered within 3 hours: when it was last
 *            updated, and that the list may not be current. Never "no news".
 */
import Head from "next/head";
import type { GetServerSideProps } from "next";
import { formatTime12 } from "@leamington/shared/src/format.ts";
import { db } from "../lib/db";
import { loadClient, recordView } from "../lib/client";
import { t } from "../lib/t";
import { OfflineBar, PageHead, TabBar } from "../lib/frame";
import { NewsLead, NewsRow, type NewsItem, type NewsPage } from "../lib/news";
import { NOTICIAS_CSS } from "../lib/page-css";

export const config = { unstable_runtimeJS: false };

/** Stories per section: enough to read over coffee, within the page budget. */
export const NEWS_LIMIT = 10;
const SECTIONS = ["local", "region", "national"] as const;
type Section = (typeof SECTIONS)[number];
const COUNTRY: Record<string, [string, string]> = { MX: ["México", "Mexico"], GT: ["Guatemala", "Guatemala"], HN: ["Honduras", "Honduras"], JM: ["Jamaica", "Jamaica"] };

type Props = { lang: "es" | "en"; tz: string; news: NewsPage | null; section: Section | null; renderedAt: string };

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const loaded = await loadClient(ctx);
  if ("redirect" in loaded) return loaded;
  const { client } = loaded;
  const news = ((await db().query("select app.news_page($1, now(), $2) as n", [client.id, NEWS_LIMIT])).rows[0]?.n ?? null) as NewsPage | null;
  const has = (s: Section) => (news?.[s]?.length ?? 0) > 0;
  const asked = SECTIONS.find((s) => s === ctx.query.s);
  const section = asked && has(asked) ? asked : SECTIONS.find(has) ?? null;
  await recordView(client.id, "noticias", {
    section, local: news?.local.length ?? null, region: news?.region.length ?? null, national: news?.national.length ?? null, stale: news?.stale ?? null,
  });
  return { props: { lang: client.language, tz: client.timezone, news, section, renderedAt: new Date().toISOString() } };
};

export default function Noticias({ lang, tz, news, section, renderedAt }: Props) {
  const nowMs = Date.parse(renderedAt);
  const items: NewsItem[] = news && section ? news[section] : [];
  const lead = items.find((n) => n.image) ?? null;
  const rest = items.filter((n) => n !== lead);
  // The local tab names the hometown only when every local story names only the hometown; with a
  // watched town among them it is "Mis pueblos" (each card's 📍 chip says which town).
  const homeOnly = !!news?.municipality && (news?.local ?? []).every((n) => n.mentions.every((m) => m === news.municipality!.name));
  const label = (s: Section) =>
    s === "local" ? (homeOnly ? news!.municipality!.name : t(lang, "Mis pueblos", "My towns"))
      : s === "region" ? news?.municipality?.admin_region ?? t(lang, "Tu región", "Your region")
      : t(lang, ...(COUNTRY[news?.country ?? ""] ?? ["Tu país", "Your country"]));
  const tabs = news ? SECTIONS.filter((s) => news[s].length > 0) : [];
  const updated = news?.updated_at ? formatTime12(news.updated_at, tz) : null;
  return (
    <>
      <Head>
        <title>{`${t(lang, "Noticias", "News")} · Hoy`}</title>
        <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
        <style dangerouslySetInnerHTML={{ __html: NOTICIAS_CSS }} />
      </Head>
      <main>
        <OfflineBar at={renderedAt} tz={tz} lang={lang} />
        <PageHead lang={lang} title={t(lang, "Noticias", "News")} art="news" back />
        {news?.stale ? (
          <p className="stale" data-stale="">
            {updated
              ? t(lang, `Actualizado a las ${updated}. La lista puede no estar al día.`, `Updated at ${updated}. The list may not be up to date.`)
              : t(lang, "Todavía no hemos podido actualizar las noticias. La lista puede no estar al día.", "We have not been able to update the news yet. The list may not be up to date.")}
          </p>
        ) : updated && (
          <p className="nupd"><small>{t(lang, `Actualizado a las ${updated}`, `Updated at ${updated}`)}</small></p>
        )}
        {tabs.length > 0 && (
          <nav className="seg" aria-label={t(lang, "Secciones", "Sections")}>
            {tabs.map((s) => (
              <a key={s} href={`/noticias?s=${s}`} data-section={s} aria-current={s === section ? "page" : undefined}>{label(s)}</a>
            ))}
          </nav>
        )}
        {section && (
          <section data-section={section}>
            {lead && <NewsLead n={lead} lang={lang} tz={tz} nowMs={nowMs} towns={section === "local"} />}
            {rest.map((n) => <NewsRow key={n.id} n={n} lang={lang} tz={tz} nowMs={nowMs} towns={section === "local"} />)}
          </section>
        )}
        {news && news.sources.length > 0 && (
          <p className="nsrc">
            <small>
              {t(lang, "Fuentes: ", "Sources: ")}
              {news.sources.map((s, i) => <span key={s.name}>{i > 0 ? " · " : ""}<a href={s.homepage_url} target="_blank" rel="noopener">{s.name}</a></span>)}
            </small>
          </p>
        )}
      </main>
      <TabBar current="mas" lang={lang} />
    </>
  );
}
