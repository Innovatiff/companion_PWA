/**
 * The page shell: title, viewport, and for a signed-in affiliate the header nav
 * (Clientes · Registrar · Ganancias · Salir) with a PRUEBA chip on test accounts.
 * Salir is a POST form, so no link prefetch or crawler can sign anyone out.
 */
import Head from "next/head";
import type { ReactNode } from "react";
import type { IncomingMessage } from "node:http";
import type { PortalPerson } from "@leamington/shared/src/server/portal.ts";
import { strings, type Lang } from "./strings.ts";

export type Viewer = { lang: Lang; name: string; isTest: boolean };
export type Nav = "clients" | "register" | "earnings" | null;

export const viewerOf = (p: PortalPerson): Viewer => ({ lang: p.language, name: p.affiliateName ?? p.login, isTest: p.isTest });

/** For pages/_document.tsx: <html lang> follows the signed-in person. */
export function setPageLang(req: IncomingMessage, lang: string): void {
  (req as { appLang?: string }).appLang = lang;
}

const current = (nav: Nav, item: Nav) => (nav === item ? ("page" as const) : undefined);

export function Page({ title, viewer, nav = null, children }: { title: string; viewer: Viewer | null; nav?: Nav; children: ReactNode }) {
  const t = strings(viewer?.lang);
  return (
    <>
      <Head>
        <title>{`${title} · ${t.portal}`}</title>
        <meta name="viewport" content="width=device-width,initial-scale=1" />
      </Head>
      {viewer && (
        <header className="bar">
          <span>
            {viewer.name}
            {viewer.isTest && <> <span className="chip">{t.test}</span></>}
          </span>
          <nav>
            <a href="/" aria-current={current(nav, "clients")}>{t.navClients}</a>
            <a href="/register" aria-current={current(nav, "register")}>{t.navRegister}</a>
            <a href="/earnings" aria-current={current(nav, "earnings")}>{t.navEarnings}</a>
            <form method="post" action="/api/logout">
              <button type="submit">{t.signOut}</button>
            </form>
          </nav>
        </header>
      )}
      <main>{children}</main>
    </>
  );
}
