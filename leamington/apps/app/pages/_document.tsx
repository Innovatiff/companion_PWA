import Document, { Html, Head, Main, NextScript, type DocumentContext, type DocumentInitialProps } from "next/document";

// Inline, so a cold load is one HTML response. Large type, one column, high contrast.
const CSS = `*{box-sizing:border-box}
body{margin:0;font:18px/1.45 system-ui,-apple-system,Roboto,"Segoe UI",sans-serif;color:#10231c;background:#f6f3ea}
main{max-width:34rem;margin:0 auto;padding:1.25rem 1rem 2rem}
#slot:empty{display:none}
h1{font-size:1.55rem;line-height:1.25;margin:.5rem 0 1rem;font-weight:650}
p{margin:.6rem 0;font-size:1.2rem}
small{color:#566860;font-size:.78rem;white-space:nowrap}
#stamp{color:#566860;font-size:.9rem;margin-top:1.5rem}
label{display:block;font-size:1.1rem}
form{display:grid;gap:.8rem;margin-top:1.25rem}
input{font:inherit;font-size:1.5rem;letter-spacing:.12em;text-transform:uppercase;padding:.6rem .7rem;border:2px solid #10231c;border-radius:.5rem;width:100%;background:#fff}
button{font:inherit;font-size:1.2rem;padding:.75rem;border:0;border-radius:.5rem;background:#10231c;color:#fff}
.err{color:#9b1c1c}`;

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
