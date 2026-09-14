import Document, { Html, Head, Main, NextScript, type DocumentContext, type DocumentInitialProps } from "next/document";
import { APP_CSS, DARK_CSS } from "@leamington/shared/src/ui/css.ts";

// Inline, so a cold load is one HTML response (docs/DESIGN.md).
const CSS = APP_CSS + "input.codein{font-size:1.5rem;letter-spacing:.12em;text-transform:uppercase}" + DARK_CSS;

type Props = DocumentInitialProps & { lang: string; big: boolean; theme: string | null };

export default class AppDocument extends Document<Props> {
  static async getInitialProps(ctx: DocumentContext): Promise<Props> {
    const initial = await Document.getInitialProps(ctx);
    // Pages set req.appLang in getServerSideProps once the user's language is known.
    const req = ctx.req as { appLang?: string; appTextSize?: string; appTheme?: string } | undefined;
    const lang = req?.appLang === "en" ? "en" : "es";
    // Letra grande (clients.text_size = 'large', coming): pages set req.appTextSize.
    // Modo noche (0046): "dark" or "light" fix the look; "auto" leaves it to the phone.
    const theme = req?.appTheme === "dark" || req?.appTheme === "light" ? req.appTheme : null;
    return { ...initial, lang, big: req?.appTextSize === "large", theme };
  }

  render() {
    return (
      <Html lang={this.props.lang} className={[this.props.big ? "big" : null, this.props.theme].filter(Boolean).join(" ") || undefined}>
        <Head>
          <link rel="manifest" href="/manifest.webmanifest" />
          <meta name="theme-color" content="#eef0fb" />
          {/* No favicon request: every byte on a cold load counts. */}
          <link rel="icon" href="data:," />
          <style dangerouslySetInnerHTML={{ __html: CSS }} />
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}
