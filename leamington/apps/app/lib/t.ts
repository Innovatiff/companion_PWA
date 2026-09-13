/**
 * Pick the Spanish or English string. Kept apart from lib/client.ts, which
 * imports the database: a component importing from there would pull pg into
 * the browser bundle.
 */
export const t = (lang: "es" | "en", es: string, en: string): string => (lang === "en" ? en : es);
