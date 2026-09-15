/**
 * "Avisos para tu familia" (0052 app.family_warnings), on Clima's warnings and
 * on Más → Notificaciones, for a country whose official warnings Hoy reads.
 *
 * It says which towns we read warnings for (home and every watched town), what
 * arrives as a notification, when we last checked (or since when we could not),
 * and whether this phone gets the notifications, with a way to turn them on.
 * It never says whether there are warnings: absence in our database is not
 * safety, so there is no "no hay avisos" and no reassurance here.
 */
import type { ReactNode } from "react";
import type { Lang } from "@leamington/shared/src/format.ts";
import { t } from "./t";

export type Family = {
  state: "current" | "stale" | "not_monitored";
  checked_at: string | null;
  agency: string | null;
  agency_url: string | null;
  push_levels: string[] | null;
  towns: { id: number; name: string; is_home: boolean }[];
  watching: number;
  subscriptions: number;
};

/**
 * This phone's own subscription decides the line and the button; without a
 * script (or push support) the server's count stays. About 0.4 KB.
 */
export const PHONE_SCRIPT = `(function(){var p=document.getElementById("ph");if(!p||!("serviceWorker" in navigator)||!("PushManager" in window))return;navigator.serviceWorker.getRegistration().then(function(r){return r&&r.pushManager.getSubscription()}).then(function(s){var on=!!s&&p.getAttribute("data-n")!=="0";p.textContent=p.getAttribute(on?"data-on":"data-off");var b=document.getElementById("pb");if(b)b.hidden=on})["catch"](function(){})})();`;

export function FamilyWarnings({ f, lang, moment, agencyLink, button }: {
  f: Family; lang: Lang; moment: (iso: string) => string; agencyLink: ReactNode; button: boolean;
}) {
  const agency = f.agency ?? "";
  const hasHome = f.towns.some((x) => x.is_home);
  const n = f.subscriptions;
  return (
    <section className="fam" data-line="family" aria-labelledby="famh">
      <h3 id="famh">{t(lang, "Avisos para tu familia", "Warnings for your family")}</h3>
      <p><small>
        {(f.push_levels ?? []).includes("orange")
          ? t(lang, `Hoy lee los avisos oficiales de ${agency} para estos lugares. Los rojos y naranjas llegan como notificación; los amarillos, solo aquí.`,
                    `Hoy reads ${agency}'s official warnings for these places. Red and orange ones arrive as a notification; yellow ones show only here.`)
          : t(lang, `Hoy lee los avisos oficiales de ${agency} para estos lugares. Los rojos llegan como notificación; los demás, solo aquí.`,
                    `Hoy reads ${agency}'s official warnings for these places. Red ones arrive as a notification; the rest show only here.`)}
      </small></p>
      {f.towns.length > 0 && (
        <ul className="ftowns">
          {f.towns.map((x) => (
            <li key={x.id}>{x.name}{x.is_home && <small>{t(lang, "tu municipio", "your town")}</small>}</li>
          ))}
        </ul>
      )}
      <a className="fadd" href={hasHome ? "/setup/watch?edit=1" : "/setup/municipality?edit=1"}>
        {!hasHome ? t(lang, "Elegir tu municipio", "Choose your town")
          : f.watching < 3 ? t(lang, "+ Agregar un pueblo", "+ Add a town")
          : t(lang, "Cambiar pueblos", "Change towns")}
      </a>
      {f.state === "current" && f.checked_at && (
        <p className="fck"><small>
          {t(lang, `Revisamos los avisos de ${agency} a las ${moment(f.checked_at)}.`, `We checked ${agency} warnings at ${moment(f.checked_at)}.`)}
        </small></p>
      )}
      {f.state === "stale" && (
        <div className="fst">
          <p>
            {f.checked_at
              ? t(lang, `No hemos podido revisar los avisos de ${agency} desde las ${moment(f.checked_at)}.`,
                        `We have not been able to check ${agency} warnings since ${moment(f.checked_at)}.`)
              : t(lang, `No hemos podido revisar los avisos de ${agency}.`, `We have not been able to check ${agency} warnings.`)}
          </p>
          {agencyLink}
        </div>
      )}
      <p id="ph" className="fph" data-n={n}
         data-on={t(lang, "Este teléfono recibe estas notificaciones.", "This phone gets these notifications.")}
         data-off={t(lang, "Este teléfono no recibe estas notificaciones.", "This phone does not get these notifications.")}>
        {n > 0
          ? t(lang, `Te llegan a ${n === 1 ? "1 teléfono" : `${n} teléfonos`}.`, `They reach ${n === 1 ? "1 phone" : `${n} phones`} of yours.`)
          : t(lang, "Ningún teléfono tuyo recibe estas notificaciones todavía.", "None of your phones gets these notifications yet.")}
      </p>
      {button && (
        <a id="pb" className="fbtn" href="/mas/avisos" hidden={n > 0}>{t(lang, "Activar notificaciones", "Turn on notifications")}</a>
      )}
    </section>
  );
}
