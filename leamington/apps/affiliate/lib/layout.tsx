/**
 * The page frame (docs/DESIGN.md section 9): for a signed-in affiliate the shared
 * sidebar (Mis clientes · Registrar · Instalar Hoy · Vista previa · Renovar · Ganancias), the business name with
 * a PRUEBA chip on test accounts, and a POST sign-out form, so no link prefetch or
 * crawler can sign anyone out. Signed-out pages use the single-card AuthLayout.
 */
import Head from "next/head";
import type { ReactNode } from "react";
import type { IncomingMessage } from "node:http";
import type { PortalPerson } from "@leamington/shared/src/server/portal.ts";
import { AuthLayout, Shell, type NavItem } from "@leamington/shared/src/ui/Portal.tsx";
import { STRINGS, strings, type Lang } from "./strings.ts";

export type Viewer = { lang: Lang; name: string; isTest: boolean };
export type Nav = "clients" | "register" | "install" | "preview" | "renew" | "earnings" | null;
/** Sidebar counts, only where the page already has them from the database. */
export type Badges = { clients?: number; due?: number };

export const viewerOf = (p: PortalPerson): Viewer => ({ lang: p.language, name: p.affiliateName ?? p.login, isTest: p.isTest });

/** For pages/_document.tsx: <html lang> follows the signed-in person. */
export function setPageLang(req: IncomingMessage, lang: string): void {
  (req as { appLang?: string }).appLang = lang;
}

/** For pages/_document.tsx: "lite" inlines only the rules a page without tables or stat cards uses (lib/lite-css.ts). */
export function setPageCss(req: IncomingMessage, css: "full" | "lite"): void {
  (req as { appCss?: string }).appCss = css;
}

const Title = ({ title, portal }: { title: string; portal: string }) => (
  <Head>
    <title>{`${title} · ${portal}`}</title>
    <meta name="viewport" content="width=device-width,initial-scale=1" />
  </Head>
);

export function Page({ title, viewer, nav = null, badges = {}, children }: {
  title: string; viewer: Viewer; nav?: Nav; badges?: Badges; children: ReactNode;
}) {
  const t = strings(viewer.lang);
  const items: NavItem[] = [
    { href: "/", label: t.navMyClients, icon: "users", current: nav === "clients", badge: badges.clients },
    { href: "/register", label: t.navRegister, icon: "userPlus", current: nav === "register" },
    { href: "/instalar", label: t.navInstall, icon: "phone", current: nav === "install" },
    { href: "/vista-previa", label: t.navPreview, icon: "search", current: nav === "preview" },
    { href: "/renew", label: t.navRenew, icon: "refresh", current: nav === "renew", badge: badges.due, tone: "warn" },
    { href: "/earnings", label: t.navEarnings, icon: "wallet", current: nav === "earnings" },
  ];
  return (
    <>
      <Title title={title} portal={t.portal} />
      <Shell brand={t.brand} product={t.portal} nav={items} signOutLabel={t.signOut}
             person={{ name: viewer.name, role: t.role, chip: viewer.isTest ? <span className="chip test">{t.test}</span> : undefined }}>
        {children}
      </Shell>
    </>
  );
}

/** Sign-in, set-password and error pages: before sign-in the language is unknown, so the product name is in both. */
export function AuthPage({ title, children }: { title: string; children: ReactNode }) {
  const { es, en } = STRINGS;
  return (
    <>
      <Title title={title} portal={es.portal} />
      <AuthLayout brand={es.brand} product={`${es.portal} · ${en.portal}`}>{children}</AuthLayout>
    </>
  );
}
