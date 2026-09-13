/**
 * The owner portal frame and small building blocks (docs/DESIGN.md section 4):
 * header nav, chips in words, stats with their period, tables with captions.
 */
import Head from "next/head";
import type { ReactNode } from "react";
import { strings } from "./i18n.ts";
import type { Viewer } from "./server.ts";

export type Section = "sales" | "clients" | "renewals" | "affiliates" | "revenue" | "feeds" | "alerts";

const NAV: [Section, string][] = [
  ["sales", "/"], ["clients", "/clients"], ["renewals", "/renewals"], ["affiliates", "/affiliates"],
  ["revenue", "/revenue"], ["feeds", "/feeds"], ["alerts", "/alerts"],
];

export function Page({ viewer, section, title, children }: { viewer: Viewer; section: Section | null; title: string; children: ReactNode }) {
  const t = strings(viewer.lang);
  return (
    <>
      <Head>
        <title>{`${title} · ${t.brand}`}</title>
        <meta name="viewport" content="width=device-width,initial-scale=1" />
      </Head>
      <header className="bar">
        <nav aria-label={t.brand}>
          {NAV.map(([key, href]) => (
            <a key={key} href={href} aria-current={key === section ? "page" : undefined}>{t.nav[key]}</a>
          ))}
        </nav>
        <form method="post" action="/api/logout">
          <button type="submit">{t.nav.logout}</button>
        </form>
      </header>
      <main>
        <h1>{title}</h1>
        {children}
      </main>
    </>
  );
}

export type ChipKind = "test" | "bad" | "warn" | "good" | "unk" | "plain";

export const Chip = ({ kind = "plain", children }: { kind?: ChipKind; children: ReactNode }) => (
  <span className={`chip ${kind}`}>{children}</span>
);

/** A stat is never shown without the period it covers. */
export const Stat = ({ value, label, period }: { value: ReactNode; label: string; period: string }) => (
  <div className="stat"><b>{value}</b>{label} <small>— {period}</small></div>
);

export const Note = ({ kind = "ok", children }: { kind?: "ok" | "bad"; children: ReactNode }) => (
  <p className={`note ${kind}`} role={kind === "bad" ? "alert" : "status"}>{children}</p>
);

/** Status of a client in words, with the timing when it matters. */
export function StatusChip({ status, daysLeft, lang }: { status: string; daysLeft: number | null; lang: "es" | "en" }) {
  const t = strings(lang);
  if (status === "due") return <Chip kind="warn">{t.dueIn(daysLeft ?? 0)}</Chip>;
  if (status === "lapsed") return <Chip kind="bad">{t.status.lapsed}</Chip>;
  if (status === "active") return <Chip kind="good">{t.status.active}</Chip>;
  return <Chip kind="unk">{t.status[status] ?? status}</Chip>;
}
