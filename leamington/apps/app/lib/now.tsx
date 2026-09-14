/**
 * "Ahora": the weather right now at a place (0040, app.current_summary): the
 * median of at least two providers observed within 90 minutes, a range when
 * they disagree, and its own valid_until. A place without it shows no "Ahora"
 * at all; feeling, humidity and wind each appear only when two providers gave
 * them.
 *
 * Every "Ahora" element carries data-line/data-until (the page's validity
 * mechanism: lib/open-script.ts removes it once expired, including on a cached
 * copy), plus the temperature, observation time and sky it shows, so the smoke
 * test can hold the markup to the data.
 */
import { formatTime12, type Lang } from "@leamington/shared/src/format.ts";
import { t } from "./t";
import { ART_NAMES, Art, Icon, Num, type ArtName } from "./ui";

export type Now = {
  temp: string; temp_c: number; feels_like?: number; humidity?: number; wind_kph?: number;
  condition?: string; label?: string; is_day?: boolean;
  observed_at: string; valid_until: string; providers: number;
};

/** Shown only with a temperature and an observation time, and only until it expires. */
export const nowLive = (n: Now | null | undefined, at: number): n is Now =>
  Boolean(n && n.temp && n.observed_at && n.valid_until && Date.parse(n.valid_until) > at);

/**
 * The picture for the sky now. Night uses the moon; without a reported sky, a
 * plain cloud (it claims no sun and no rain).
 */
export function nowArt(n: Pick<Now, "condition" | "is_day">): ArtName {
  const night = n.is_day === false;
  if (n.condition === "clear") return night ? "moon" : "sun";
  if (n.condition === "partly_cloudy") return night ? "partly-night" : "partly-day";
  return n.condition && n.condition !== "cloudy" && (ART_NAMES as readonly string[]).includes(n.condition)
    ? (n.condition as ArtName) : "cloud";
}

/** The attributes every "Ahora" element carries. */
export const nowData = (key: string, n: Now) => ({
  "data-line": key, "data-until": n.valid_until, "data-temp": n.temp, "data-at": n.observed_at,
  "data-cond": n.condition ?? "", "data-day": n.is_day == null ? "" : n.is_day ? "1" : "0",
});

export const ahoraWord = (lang: Lang) => <b className="aw">{t(lang, "Ahora", "Now")}</b>;

/** Feeling, humidity and wind as small icon chips; each only when reported. */
export function NowChips({ n, lang }: { n: Now; lang: Lang }) {
  if (n.feels_like == null && n.humidity == null && n.wind_kph == null) return null;
  return (
    <p className="nc">
      {n.feels_like != null && <span><Icon name="thermo" />{t(lang, `Sensación ${n.feels_like}°`, `Feels like ${n.feels_like}°`)}</span>}
      {n.humidity != null && <span><Icon name="drop" /><span className="sr">{t(lang, "Humedad ", "Humidity ")}</span>{`${n.humidity}%`}</span>}
      {n.wind_kph != null && <span><Icon name="wind" /><span className="sr">{t(lang, "Viento ", "Wind ")}</span>{`${n.wind_kph} km/h`}</span>}
    </p>
  );
}

/**
 * Clima's "Ahora" block: the sky's picture, the temperature big, its word, the
 * time it was observed in the place's own timezone, and the chips.
 */
export function AhoraCard({ n, lang, tz, inside = false }: { n: Now; lang: Lang; tz: string; inside?: boolean }) {
  return (
    <div className={inside ? "ahora in" : "ahora card"} {...nowData("now", n)}>
      <Art name={nowArt(n)} size={inside ? 60 : 96} />
      <span>
        <small>{ahoraWord(lang)}{` · ${t(lang, "a las", "at")} ${formatTime12(n.observed_at, tz)}`}</small>
        <Num value={n.temp} className="tn" />
        {n.label && <b className="lab">{n.label}</b>}
      </span>
      <NowChips n={n} lang={lang} />
    </div>
  );
}
