/** Server error, with no framework JS. It says so plainly; it never shows old data. */
import Head from "next/head";
import { Art } from "../lib/ui";

export const config = { unstable_runtimeJS: false };

export default function ServerError() {
  return (
    <>
      <Head>
        <title>Hoy</title>
        <meta name="viewport" content="width=device-width,initial-scale=1" />
      </Head>
      <main>
        <header className="hello">
          <div>
            <h1>Algo falló de nuestro lado<br /><small>Something went wrong on our side</small></h1>
            <p>Inténtalo otra vez en unos minutos.<br /><small>Try again in a few minutes.</small></p>
          </div>
          <Art name="storm" size={80} />
        </header>
        <a className="button" href="/">Inicio · Home</a>
      </main>
    </>
  );
}
