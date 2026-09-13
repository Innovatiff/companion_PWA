import Document, { Html, Head, Main, NextScript, type DocumentContext, type DocumentInitialProps } from "next/document";
import { APP_CSS } from "@leamington/shared/src/ui/css.ts";

// Inline, so a cold load is one HTML response (docs/DESIGN.md).
const CSS = APP_CSS + "input.codein{font-size:1.5rem;letter-spacing:.12em;text-transform:uppercase}";

type Props = DocumentInitialProps & { lang: string };

export default class AppDocument extends Document<Props> {
  static async getInitialProps(ctx: DocumentContext): Promise<Props> {
    const initial = await Document.getInitialProps(ctx);
    // Pages set req.appLang in getServerSideProps once the user's language is known.
    const lang = (ctx.req as { appLang?: string } | undefined)?.appLang === "en" ? "en" : "es";
    return { ...initial, lang };
  }

  render() {
    return (
      <Html lang={this.props.lang}>
        <Head>
          <link rel="manifest" href="/manifest.webmanifest" />
          <meta name="theme-color" content="#10231c" />
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
