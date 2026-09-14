/** Server error, with no framework JS. A portal page that cannot load fails visibly, never with old numbers. */
import Head from "next/head";
import { AuthLayout } from "@leamington/shared/src/ui/Portal.tsx";

export const config = { unstable_runtimeJS: false };

export default function ServerError() {
  return (
    <>
      <Head>
        <title>Error · Hoy Admin</title>
        <meta name="viewport" content="width=device-width,initial-scale=1" />
      </Head>
      <AuthLayout brand="Hoy" product="Admin">
        <h1>Error del servidor<small>Server error</small></h1>
        <p className="note bad">La página no pudo cargar. No se muestran datos anteriores.<br /><small>The page could not load. No older figures are shown.</small></p>
        <p><a href="/">Ventas · Sales</a></p>
      </AuthLayout>
    </>
  );
}
