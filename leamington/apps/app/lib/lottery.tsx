/**
 * ¿Salió mi número? (0045): a member's numbers against their country's official
 * results of the last 7 days (app.lottery_check).
 *
 * CLAUDE.md, binding: official RESULTS only. It says which numbers match and
 * nothing else: never a prize, "ganaste", odds, "hot numbers" or a link to buy.
 * A game whose results are not up to date is not compared. Every draw shows its
 * date, time, "Verificado" and the official source.
 */
import { formatDate, formatTime12, localDate, type Lang } from "@leamington/shared/src/format.ts";
import { t } from "./t";
import { drawTime } from "./ui";

export type CheckableGame = {
  game_id: number; game: string; operator: string; country: string; match: "set" | "digits";
  pick_min: number; pick_max: number; min: number; max: number; distinct: boolean; any_order_play: boolean;
  draw_times: string[]; rules_url: string; format_verified_at: string;
};
export type CheckDraw = {
  draw_date: string; draw_time?: string; numbers: string[]; matched: number[]; matched_count: number;
  verified_at: string; source_url: string; positions?: boolean[]; same_digits_any_order?: boolean;
};
export type Check =
  | { error: "invalid_numbers" | "format_unverified" | "not_your_country" | "unknown_game"; message: string; game?: string;
      pick_min?: number; pick_max?: number; min?: number; max?: number; match?: string }
  | { error?: undefined; game_id: number; game: string; operator: string; match: "set" | "digits"; numbers: number[];
      state: "current" | "stale"; newest_draw_date: string | null; window: { from: string; to: string }; draws: CheckDraw[] | null;
      rules_url: string; checked_at: string };

/** How many inputs a game's form offers: its picks, at most 10 (Cash Pot allows 36, rarely all). */
export const inputsFor = (g: CheckableGame) => (g.match === "digits" ? g.pick_max : Math.min(g.pick_max, 10));
/** A number as the operator prints it: Santa Lucía's 5-digit tickets keep their leading zeros. */
export const shown = (n: number | string, g: { max: number }) => (g.max >= 1000 ? String(n).padStart(String(g.max).length, "0") : String(n));

/** A refusal in the member's words, from the refusal's own fields. */
export function refusalText(c: Extract<Check, { error: string }>, g: CheckableGame | undefined, lang: Lang): string {
  if (c.error === "invalid_numbers" && g) {
    const count = g.pick_min === g.pick_max ? String(g.pick_min) : t(lang, `${g.pick_min} a ${g.pick_max}`, `${g.pick_min} to ${g.pick_max}`);
    const kind = g.match === "digits" ? t(lang, "dígitos", "digits") : g.pick_max === 1 ? t(lang, "número", "number") : t(lang, "números", "numbers");
    return t(lang, `${g.game} usa ${count} ${kind} del ${shown(g.min, g)} al ${shown(g.max, g)}${g.distinct && g.pick_max > 1 ? ", sin repetir" : ""}.`,
                   `${g.game} takes ${count} ${kind} from ${shown(g.min, g)} to ${shown(g.max, g)}${g.distinct && g.pick_max > 1 ? ", no repeats" : ""}.`);
  }
  if (c.error === "format_unverified") return t(lang, "Todavía no podemos comparar números para este juego.", "We cannot compare numbers for this game yet.");
  return t(lang, "Ese juego no está disponible para ti.", "That game is not available to you.");
}

const matchText = (n: number, lang: Lang) =>
  n === 0 ? t(lang, "Ningún número coincide", "No number matches")
    : n === 1 ? t(lang, "Coincide 1 número", "1 number matches")
    : t(lang, `Coinciden ${n} números`, `${n} numbers match`);

/**
 * One official draw against the member's numbers: the official balls with the
 * matching ones ringed and checked (by position for digit games), how many
 * match, the same digits in another order where the operator sells that play,
 * and the draw's date, time, verification and source.
 */
export function DrawCheck({ d, c, g, lang, tz }: { d: CheckDraw; c: Extract<Check, { state: string }>; g: CheckableGame; lang: Lang; tz: string }) {
  const hit = (value: string, i: number) => c.match === "digits" ? Boolean(d.positions?.[i]) : c.numbers.includes(Number(value));
  const allInPlace = c.match === "digits" && (d.positions ?? []).every(Boolean);
  return (
    <div className="tile draw" data-draw={`${d.draw_date} ${d.draw_time ?? ""}`.trim()} data-matched={d.matched_count}>
      <span>
        <small>{`${formatDate(d.draw_date, lang)}${d.draw_time ? ` · ${drawTime(d.draw_time)}` : ""}`}</small>
        <span className="balls">
          {d.numbers.map((n, i) => (
            <b key={i} className={hit(n, i) ? "hit" : undefined}>
              {shown(n, g)}{hit(n, i) && <i aria-hidden="true">✓</i>}
            </b>
          ))}
        </span>
        <p className="line">{matchText(d.matched_count, lang)}</p>
        {c.match === "digits" && d.matched_count > 0 && !allInPlace && (
          <small className="pos">{t(lang, `En su lugar: ${(d.positions ?? []).map((p, i) => (p ? `${i + 1}.º` : null)).filter(Boolean).join(", ")}`,
                                         `In place: ${(d.positions ?? []).map((p, i) => (p ? `#${i + 1}` : null)).filter(Boolean).join(", ")}`)}</small>
        )}
        {d.same_digits_any_order && !allInPlace && (
          <small className="anyo">{t(lang, "Salieron los mismos dígitos en otro orden.", "The same digits came out in another order.")}</small>
        )}
        <small>
          {`${t(lang, "Verificado", "Verified")}: ${formatDate(localDate(d.verified_at, tz), lang)}, ${formatTime12(d.verified_at, tz)} · `}
          <a href={d.source_url} rel="noopener">{t(lang, "Fuente", "Source")}: {g.operator}</a>
        </small>
      </span>
    </div>
  );
}
