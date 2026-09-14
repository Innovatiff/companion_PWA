/**
 * Pure helpers for the clients list and the code page. No database, no Next.
 */
import type { Lang, Strings } from "./strings.ts";

export const COUNTRIES = ["MX", "GT", "HN", "JM"] as const;
export type Country = (typeof COUNTRIES)[number];

export const isCountry = (v: unknown): v is Country => typeof v === "string" && (COUNTRIES as readonly string[]).includes(v);

const COUNTRY_NAMES: Record<Lang, Record<Country, string>> = {
  es: { MX: "México", GT: "Guatemala", HN: "Honduras", JM: "Jamaica" },
  en: { MX: "Mexico", GT: "Guatemala", HN: "Honduras", JM: "Jamaica" },
};

export const countryName = (c: string, lang: Lang): string => (isCountry(c) ? COUNTRY_NAMES[lang][c] : c);

/** What the admin_region column is called in each country. */
const REGION_LABELS: Record<Lang, Record<Country, string>> = {
  es: { MX: "Estado", GT: "Departamento", HN: "Departamento", JM: "Parroquia" },
  en: { MX: "State", GT: "Department", HN: "Department", JM: "Parish" },
};

export const regionLabel = (c: Country, lang: Lang): string => REGION_LABELS[lang][c];

/** client_status.status, from 0019_sales_ledger.sql. */
export type Status = "active" | "due" | "lapsed" | "none";

export function statusLabel(status: string, t: Strings): string {
  switch (status) {
    case "active": return t.statusActive;
    case "due": return t.statusDue;
    case "lapsed": return t.statusLapsed;
    default: return t.statusNone;
  }
}

/** The chip colour for a status. The chip always carries the status in words too. */
export function statusTone(status: string): "good" | "warn" | "bad" | "unk" {
  return status === "active" ? "good" : status === "due" ? "warn" : status === "lapsed" ? "bad" : "unk";
}

export type ClientRow = {
  id: string;
  fullName: string;
  code: string;
  country: string;
  adminRegion: string | null;
  status: string;
  daysLeft: number | null;
  periodEnd: string | null; // "YYYY-MM-DD"
  isTest: boolean;
  active: boolean;
  createdAt: string;
};

/** Renewals due soon, soonest first; then every client, newest first. */
export function splitClients(rows: ClientRow[]): { due: ClientRow[]; all: ClientRow[] } {
  const due = rows
    .filter((r) => r.status === "due")
    .sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0) || a.fullName.localeCompare(b.fullName));
  const all = [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.fullName.localeCompare(b.fullName));
  return { due, all };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

/** The instruction printed for the client, in the client's own language. */
export function clientInstruction(clientLang: string, hoyUrl: string | null): string {
  const where = hoyUrl ? ` ${hoyUrl}` : "";
  return clientLang === "en"
    ? `Open Hoy${where} on your phone and enter this code. The code is your account: keep this paper. On a new phone, enter the same code again.`
    : `Abre Hoy${where} en tu teléfono y escribe este código. El código es tu cuenta: guarda este papel. Si cambias de teléfono, escribe el mismo código otra vez.`;
}
