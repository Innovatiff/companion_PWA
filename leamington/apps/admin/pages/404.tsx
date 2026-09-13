/** Not found, with no framework JS (Next's default error page ships its runtime). */
import Head from "next/head";

export const config = { unstable_runtimeJS: false };

export default function NotFound() {
  return (
    <>
      <Head>
        <title>No encontrado · Admin</title>
        <meta name="viewport" content="width=device-width,initial-scale=1" />
      </Head>
      <main className="narrow">
        <h1>No encontrado<br /><small>Not found</small></h1>
        <p><a href="/">Ventas · Sales</a></p>
      </main>
    </>
  );
}
