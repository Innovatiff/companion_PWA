/**
 * Hoy en Leamington (0044): Leamington's weather now, the time change when it
 * is near, the next 12 hours, sun and heat, air quality, and daylight.
 *
 * Each block renders only with its data and carries its own validity
 * (data-until), dropped on an open or restored page by the expiry script. The
 * clock change and daylight are computed from timezone rules and astronomy.
 */
import Head from "next/head";
import type { GetServerSideProps } from "next";
import { db } from "../../lib/db";
import { loadClient, recordView } from "../../lib/client";
import { t } from "../../lib/t";
import { PageHead, TabBar } from "../../lib/frame";
import { EXPIRE_SCRIPT } from "../../lib/open-script";
import { AhoraCard, nowArt, nowLive, type Now } from "../../lib/now";
import { Art, LEAMINGTON } from "../../lib/ui";
import { AirCard, Daylight, DstCard, HourlyChart, SunHeatCard, type Air, type Hourly, type SunHeat } from "../../lib/workday";
import { AQUI_CSS } from "../../lib/page-css";

export const config = { unstable_runtimeJS: false };

type Props = {
  lang: "es" | "en"; at: string; now: Now | null; hourly: Hourly | null; sun: SunHeat | null; air: Air | null;
  homeTz: string | null; homeName: string | null;
};

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const loaded = await loadClient(ctx);
  if ("redirect" in loaded) return loaded;
  const { client } = loaded;
  const { rows } = await db().query(
    `select app.hourly_outlook('leamington', now(), 12, $2) as h, app.sun_and_heat('leamington', now(), $2) as s,
            app.air_quality('leamington', now(), $2) as a, app.current_summary(null, lp.id, now(), $2) as n,
            (select m.timezone from clients c join municipalities m on m.id = c.municipality_id where c.id = $1) as home_tz
       from local_places lp where lp.key = 'leamington'`, [client.id, client.language]);
  const r = rows[0] ?? {};
  // LOCAL ONLY: with HOY_SKY_PREVIEW=1, ?at= sets the moment for the clock change
  // and daylight, for screenshots and the smoke test. Production never sets it.
  const at = process.env.HOY_SKY_PREVIEW === "1" && typeof ctx.query.at === "string" && Number.isFinite(Date.parse(ctx.query.at))
    ? new Date(ctx.query.at).toISOString() : new Date().toISOString();
  await recordView(client.id, "aqui", {
    hourly: r.h ? r.h.hours.length : null, sun: Boolean(r.s), air: r.a ? (r.a.range ? "range" : "value") : null, now: Boolean(r.n),
  });
  return {
    props: {
      lang: client.language, at, now: r.n ?? null, hourly: r.h ?? null, sun: r.s ?? null, air: r.a ?? null,
      homeTz: r.home_tz ?? null, homeName: client.municipality,
    },
  };
};

export default function Aqui({ lang, at, now, hourly, sun, air, homeTz, homeName }: Props) {
  const when = new Date(at);
  const current = nowLive(now, Date.now()) ? now : null;
  return (
    <>
      <Head>
        <title>{`${t(lang, "Hoy en Leamington", "Today in Leamington")} · Hoy`}</title>
        <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
        <style dangerouslySetInnerHTML={{ __html: AQUI_CSS }} />
      </Head>
      <main>
        <PageHead lang={lang} title={t(lang, "Hoy en Leamington", "Today in Leamington")} art={current ? nowArt(current) : "partly-day"} back="/clima" />
        {current && <AhoraCard n={current} lang={lang} tz={LEAMINGTON.timezone} />}
        <DstCard at={when} lang={lang} homeTz={homeTz} homeName={homeName} />
        {hourly && (
          <section className="card hrs" data-line="hourly" data-until={hourly.valid_until}>
            <div className="ch"><Art name="chart" size={44} lazy /><h2>{t(lang, "Por horas", "Hour by hour")}</h2></div>
            <HourlyChart h={hourly} lang={lang} />
          </section>
        )}
        {sun && <SunHeatCard s={sun} lang={lang} />}
        {air && <AirCard a={air} lang={lang} tz={LEAMINGTON.timezone} />}
        <Daylight at={when} lang={lang} />
      </main>
      <TabBar current="clima" lang={lang} />
      <script dangerouslySetInnerHTML={{ __html: EXPIRE_SCRIPT }} />
    </>
  );
}
