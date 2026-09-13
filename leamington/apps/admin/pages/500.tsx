/** Server error, with no framework JS. A portal page that cannot load fails visibly, never with old numbers. */
import Head from "next/head";

export const config = { unstable_runtimeJS: false };

export default function ServerError() {
  return (
    <>
      <Head>
        <title>Error · Admin</title>
        <meta name="viewport" content="width=device-width,initial-scale=1" />
      </Head>
      <main className="narrow">
        <h1>Error del servidor<br /><small>Server error</small></h1>
        <p>La página no pudo cargar. No se muestran datos anteriores.<br /><small>The page could not load. No older figures are shown.</small></p>
        <p><a href="/">Ventas · Sales</a></p>
      </main>
    </>
  );
}
