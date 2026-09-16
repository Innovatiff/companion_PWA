/**
 * Instalar Hoy: a step-by-step guide an affiliate follows on the client's phone,
 * for Android (Chrome) or iPhone (Safari). The steps are slides in one page: they
 * swipe (CSS scroll snap), and "Anterior" / "Siguiente" are links to each slide's
 * anchor, so the guide needs no JavaScript and no request per step.
 *
 * The first slide is a QR code of Hoy's address (HOY_URL), drawn on the server,
 * so nobody types it. Opened from a client's code page (?c=), the sign-in step
 * shows that client's code; the client is read inside asPerson, so another
 * affiliate's client is simply not found.
 */
import type { GetServerSideProps } from "next";
import { requirePerson } from "@leamington/shared/src/server/portal.ts";
import { asPerson } from "@leamington/shared/src/server/db.ts";
import { formatCode } from "@leamington/shared/src/code.ts";
import { Hero, HeroAction } from "@leamington/shared/src/ui/Portal.tsx";
import { Page, setPageCss, setPageLang, viewerOf, type Viewer } from "../lib/layout.tsx";
import { strings } from "../lib/strings.ts";
import { isUuid } from "../lib/clients.ts";
import { PHONES, PHONE_LABEL, installSlides, screenWords, type Phone } from "../lib/install.ts";
import { InstallArt } from "../lib/install-art.tsx";
import { qrSvg } from "../lib/qr.ts";

export const config = { unstable_runtimeJS: false };

type Props = { viewer: Viewer; phone: Phone; url: string | null; client: { id: string; name: string; code: string } | null };

// Only this page's rules.
const CSS =
  ".phones{display:flex;gap:.35rem;padding:.35rem;margin:0 0 .4rem;background:var(--panel);border:1px solid var(--line);border-radius:999px;max-width:24rem}" +
  ".phones a{flex:1;display:grid;place-items:center;min-height:48px;border-radius:999px;font-weight:700;text-decoration:none;color:var(--ink)}" +
  ".phones a[aria-current]{background:linear-gradient(135deg,var(--brand),var(--brand-2));color:#fff}" +
  ".phq{margin:1rem 0 .4rem;font-weight:700}.phq+small{display:block;margin:0 0 1rem}" +
  ".deck{display:flex;gap:1rem;overflow-x:auto;scroll-snap-type:x mandatory;scroll-behavior:smooth;overscroll-behavior-x:contain;scrollbar-width:none;padding:0 0 .25rem}" +
  ".deck::-webkit-scrollbar{display:none}" +
  ".slide{flex:0 0 100%;min-width:0;scroll-snap-align:start;scroll-snap-stop:always;scroll-margin-top:1rem;box-sizing:border-box;display:grid;grid-template-columns:minmax(0,17rem) minmax(0,1fr);gap:1.75rem;align-items:center;background:var(--panel);border:1px solid var(--line);border-radius:20px;padding:1.5rem}" +
  ".art{display:grid;place-items:center}.art svg{display:block;width:100%;max-width:15rem;height:auto;filter:drop-shadow(0 16px 26px rgba(30,34,90,.2))}" +
  ".art svg text{font-family:system-ui,-apple-system,Roboto,sans-serif}" +
  ".art .qr{max-width:16rem;border-radius:14px;filter:none;box-shadow:0 0 0 1px var(--line),0 16px 30px rgba(30,34,90,.14)}" +
  ".tap{fill:none;stroke:#f97316;stroke-width:3;transform-box:fill-box;transform-origin:center;animation:tap 1.6s ease-out infinite}" +
  "@keyframes tap{0%{opacity:1;transform:scale(.85)}70%,100%{opacity:0;transform:scale(1.25)}}" +
  ".step{display:inline-block;padding:.25rem .8rem;border-radius:999px;background:var(--brand-soft);color:var(--brand);font-weight:700;font-size:.85rem}" +
  ".slide h2{font-size:1.5rem;line-height:1.2;margin:.7rem 0 .5rem;overflow-wrap:anywhere}" +
  ".slide p{font-size:1.1rem;line-height:1.5;margin:0 0 .75rem}" +
  ".tip{background:var(--warn-soft);color:#5c3a00;border-radius:12px;padding:.7rem .85rem;font-size:.97rem;line-height:1.45;overflow-wrap:anywhere}.tip b{display:block;margin-bottom:.1rem}" +
  ".url{font:600 1rem/1.4 ui-monospace,\"Roboto Mono\",monospace;background:var(--bg);border-radius:10px;padding:.6rem .8rem;overflow-wrap:anywhere;margin:.35rem 0 .75rem}" +
  ".go{display:flex;gap:.6rem;margin:1.25rem 0 0}.go .button{margin:0;min-height:54px;font-size:1.05rem;display:grid;place-items:center}.go .next{flex:2}.go .secondary{flex:1}" +
  ".dots{display:flex;gap:.35rem;list-style:none;padding:0;margin:1rem 0 0}.dots li{width:.55rem;height:.55rem;border-radius:999px;background:var(--line)}.dots li.on{width:1.5rem;background:var(--brand)}" +
  ".slide.last .step{background:var(--good-soft);color:var(--good)}" +
  "@media (max-width:44rem){.slide{grid-template-columns:minmax(0,1fr);gap:1rem;padding:1.1rem}.art svg{max-width:10.5rem}.art .qr{max-width:15rem}.slide h2{font-size:1.3rem}}" +
  "@media (prefers-reduced-motion:reduce){.deck{scroll-behavior:auto}.tap{animation:none;opacity:1}}";

export const getServerSideProps: GetServerSideProps<Props> = async ({ req, res, query }) => {
  res.setHeader("Cache-Control", "private, no-store");
  const auth = await requirePerson(req, "affiliate");
  if (!auth.person) return { redirect: auth.redirect };
  const person = auth.person;
  setPageLang(req, person.language);
  setPageCss(req, "lite");

  const phone: Phone = query.t === "iphone" ? "iphone" : "android";
  const id = typeof query.c === "string" && isUuid(query.c) ? query.c : null;
  const client = id
    ? await asPerson(person.authUserId, async (q) => {
        const { rows } = await q.query("select full_name, code from client_status where client_id = $1", [id]);
        return rows[0] ? { id, name: rows[0].full_name as string, code: formatCode(rows[0].code as string) } : null;
      })
    : null;
  return { props: { viewer: viewerOf(person), phone, url: process.env.HOY_URL?.trim() || null, client } };
};

export default function Instalar({ viewer, phone, url, client }: Props) {
  const t = strings(viewer.lang);
  const w = screenWords(viewer.lang);
  const slides = installSlides(viewer.lang, phone, url ?? "", client?.code ?? null);
  const href = (p: Phone) => `/instalar?t=${p}${client ? `&c=${client.id}` : ""}`;
  const n = slides.length;
  return (
    <Page title={t.installTitle} viewer={viewer} nav="install">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <Hero
        title={client ? t.installFor(client.name) : t.installTitle}
        subtitle={t.installSub}
        action={client ? <HeroAction href={`/clients/${client.id}/code`} icon="list">{t.installBackCode}</HeroAction> : undefined}
      />
      <p className="phq">{t.installPhone}</p>
      <nav className="phones" aria-label={t.installPhone}>
        {PHONES.map((p) => (
          <a key={p} href={href(p)} aria-current={p === phone ? "page" : undefined}>{PHONE_LABEL[viewer.lang][p]}</a>
        ))}
      </nav>
      <small>{t.installPhoneHint}</small>

      <div className="deck">
        {slides.map((s, i) => (
          <section key={`${phone}-${i}`} id={`s${i + 1}`} className={i === n - 1 ? "slide last" : "slide"} aria-label={t.installStep(i + 1, n)}>
            <div className="art">
              {s.art === "qr"
                ? (url ? <span dangerouslySetInnerHTML={{ __html: qrSvg(url, t.installQr) }} /> : null)
                : <InstallArt art={s.art} phone={phone} url={url ?? ""} w={w} code={client?.code ?? null} name={client?.name ?? null} />}
            </div>
            <div>
              <span className="step">{t.installStep(i + 1, n)}</span>
              <h2>{s.title}</h2>
              {s.art === "qr" && !url ? <p className="tip">{t.installNoUrl}</p> : <p>{s.body}</p>}
              {s.art === "qr" && url && <><small>{t.installOrType}</small><div className="url">{url}</div></>}
              {s.tip && <p className="tip"><b>{t.installProblem}</b><span>{s.tip}</span></p>}
              <div className="go">
                {i > 0 && <a className="button secondary" href={`#s${i}`}>{t.installPrev}</a>}
                {i < n - 1
                  ? <a className="button next" href={`#s${i + 2}`}>{t.installNext}</a>
                  : <a className="button next" href={client ? `/clients/${client.id}/code` : "/"}>{client ? t.installBackCode : t.navMyClients}</a>}
              </div>
              {i === n - 1 && <p><a href="#s1">{t.installAgain}</a></p>}
              <ol className="dots" aria-hidden="true">
                {slides.map((_, j) => <li key={j} className={j === i ? "on" : undefined} />)}
              </ol>
            </div>
          </section>
        ))}
      </div>
    </Page>
  );
}
