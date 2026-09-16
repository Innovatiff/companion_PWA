/**
 * Rastrear envío: Ria's own "Track a transfer" page, shown inside Hoy under our
 * header. Nothing is fetched by our server and nothing the member types reaches
 * us: the frame is Ria's page, loaded by the phone when the member opens this.
 * Ria allows being framed (frame-ancestors https:); the link below opens the same
 * page in the browser for a phone where the frame does not load.
 */
import Head from "next/head";
import type { GetServerSideProps } from "next";
import { loadClient, recordView } from "../../lib/client";
import { t } from "../../lib/t";
import { PageHead } from "../../lib/frame";
import { RASTREO_CSS } from "../../lib/page-css";

export const config = { unstable_runtimeJS: false };

// Ria's own tracking page in the member's language: Spanish (Ria's es-us site; a
// PIN is tracked the same from any site) or English (Ria Canada) for Jamaica.
const RIA_TRACK_URL = {
  es: "https://www.riamoneytransfer.com/es-us/track-a-transfer/",
  en: "https://www.riamoneytransfer.com/en-ca/track-a-transfer/",
} as const;

type Props = { lang: "es" | "en" };

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const loaded = await loadClient(ctx);
  if ("redirect" in loaded) return loaded;
  await recordView(loaded.client.id, "rastrear_envio", {});
  return { props: { lang: loaded.client.language } };
};

export default function RastrearEnvio({ lang }: Props) {
  const title = t(lang, "Rastrear envío", "Track transfer");
  return (
    <>
      <Head>
        <title>{`${title} · Hoy`}</title>
        <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
        <style dangerouslySetInnerHTML={{ __html: RASTREO_CSS }} />
      </Head>
      <main className="rastreo">
        <PageHead lang={lang} title={title} art="ria" back />
        <p className="rhint">
          <small>{t(lang,
            "Escribe el número PIN o de orden de tu recibo de Ria. Página de Ria · usa datos.",
            "Enter the PIN or order number from your Ria receipt. Ria's page · uses data.")}</small>
        </p>
        <div className="rframe">
          <iframe src={RIA_TRACK_URL[lang]} title={t(lang, "Rastrear envío en Ria", "Track a transfer on Ria")}
                  referrerPolicy="no-referrer" allow="clipboard-write" />
        </div>
        <a className="rout" href={RIA_TRACK_URL[lang]} target="_blank" rel="noopener">
          {t(lang, "¿No carga? Abrir en el sitio de Ria ↗", "Not loading? Open Ria's site ↗")}
        </a>
      </main>
    </>
  );
}
