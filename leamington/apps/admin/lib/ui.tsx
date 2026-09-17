/**
 * The owner portal frame and small building blocks (docs/DESIGN.md section 9):
 * the shared dashboard Shell and Hero, chips in words, stats with their period,
 * tables inside cards.
 */
import Head from "next/head";
import type { ReactNode } from "react";
import { Shell, Hero, type IconName, type NavItem } from "@leamington/shared/src/ui/Portal.tsx";
import { strings } from "./i18n.ts";
import type { FeedState } from "./rules.ts";
import type { Viewer } from "./server.ts";

export { Card, HeroAction, StatCard, AuthLayout } from "@leamington/shared/src/ui/Portal.tsx";

export type Section = "sales" | "clients" | "renewals" | "affiliates" | "collections" | "revenue" | "feeds" | "alerts";

type Link = [Section, string, IconName];

const NAV: Link[] = [
  ["sales", "/", "chart"], ["clients", "/clients", "users"], ["renewals", "/renewals", "refresh"],
  ["affiliates", "/affiliates", "store"], ["collections", "/collections", "receipt"], ["revenue", "/revenue", "dollar"],
];
const MORE: Link[] = [["feeds", "/feeds", "activity"], ["alerts", "/alerts", "bell"]];

export function Page({ viewer, section, title, subtitle, action, stats, children }: {
  viewer: Viewer;
  section: Section | null;
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
  stats?: ReactNode;
  children: ReactNode;
}) {
  const t = strings(viewer.lang);
  // Badges only where a real count was read (server.ts navCounts); null hides them.
  const item = ([key, href, icon]: Link): NavItem => ({
    href, icon, label: t.nav[key], current: key === section,
    ...(key === "renewals" ? { badge: viewer.badges.due, tone: "warn" as const } : {}),
    ...(key === "feeds" ? { badge: viewer.badges.feedsBad, tone: "bad" as const } : {}),
  });
  return (
    <>
      <Head>
        <title>{`${title} · ${t.brand} ${t.product}`}</title>
        <meta name="viewport" content="width=device-width,initial-scale=1" />
      </Head>
      <Shell brand={t.brand} product={t.product} nav={NAV.map(item)} secondary={MORE.map(item)}
             person={{ name: viewer.login, role: t.role }} signOutLabel={t.nav.logout}>
        <Hero title={title} subtitle={subtitle} action={action} stats={stats} />
        {children}
      </Shell>
    </>
  );
}

/** "ingresos brutos" -> "Ingresos brutos", for stat card labels. */
export const cap = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

export type ChipKind = "test" | "bad" | "warn" | "good" | "unk" | "plain";

export const Chip = ({ kind = "plain", children }: { kind?: ChipKind; children: ReactNode }) => (
  <span className={`chip ${kind}`}>{children}</span>
);

export const Note = ({ kind = "ok", children }: { kind?: "ok" | "bad" | "warn"; children: ReactNode }) => (
  <p className={kind === "ok" ? "note" : `note ${kind}`} role={kind === "bad" ? "alert" : "status"}>{children}</p>
);

/** One line of explanation under a card title. */
export const Desc = ({ children }: { children: ReactNode }) => <p className="desc">{children}</p>;

/** A small figure inside a card: value, what it is, and the period it covers. */
export const Mini = ({ value, label, period }: { value: ReactNode; label: string; period: string }) => (
  <div><b>{value}</b>{label}<small>{period}</small></div>
);

export const FEED_CHIP: Record<FeedState, ChipKind> = { ok: "good", stale: "warn", error: "bad", unknown: "unk" };

/** Status of a client in words, with the timing when it matters. */
export function StatusChip({ status, daysLeft, lang }: { status: string; daysLeft: number | null; lang: "es" | "en" }) {
  const t = strings(lang);
  if (status === "due") return <Chip kind="warn">{t.dueIn(daysLeft ?? 0)}</Chip>;
  if (status === "lapsed") return <Chip kind="bad">{t.status.lapsed}</Chip>;
  if (status === "active") return <Chip kind="good">{t.status.active}</Chip>;
  return <Chip kind="unk">{t.status[status] ?? status}</Chip>;
}
