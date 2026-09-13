/** Not found, with no framework JS (Next's default error page ships its runtime). */
import Head from "next/head";

export const config = { unstable_runtimeJS: false };

export default function NotFound() {
  return (
    <>
      <Head>
        <title>Hoy</title>
        <meta name="viewport" content="width=device-width,initial-scale=1" />
      </Head>
      <main>
        <h1>No encontramos esta página<br /><small>We could not find this page</small></h1>
        <p><a href="/">Inicio · Home</a></p>
      </main>
    </>
  );
}
