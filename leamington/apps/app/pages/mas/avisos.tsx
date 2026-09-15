/**
 * Notificaciones: turn push on or off for this phone, and "Avisos para tu
 * familia" (0052): the towns we read official warnings for, whether this phone
 * gets them, and when we last checked.
 *
 * Subscribing needs the browser's Push API, so this is the one section page
 * with a script of its own (inline, about 1.6 KB). Without it, or without push
 * support, the buttons stay hidden and the page says only what we send. For a
 * country whose warnings Hoy does not read yet, one honest line and the
 * agency's page; never "no hay avisos".
 */
import Head from "next/head";
import type { GetServerSideProps } from "next";
import { formatDate, formatTime12, localDate } from "@leamington/shared/src/format.ts";
import { db } from "../../lib/db";
import { loadClient, recordView } from "../../lib/client";
import { t } from "../../lib/t";
import { PageHead, TabBar } from "../../lib/frame";
import { Pic } from "../../lib/ui";
import { FamilyWarnings, type Family } from "../../lib/family";
import { AVISOS_CSS } from "../../lib/page-css";

export const config = { unstable_runtimeJS: false };

type Props = { lang: "es" | "en"; vapid: string | null; family: Family; tz: string; today: string };

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  // Alert notifications continue after a paid period ends, so this stays open.
  const loaded = await loadClient(ctx, { allowUnpaid: true });
  if ("redirect" in loaded) return loaded;
  const { client } = loaded;
  const family = (await db().query("select app.family_warnings($1) as f", [client.id])).rows[0]?.f as Family;
  const vapid = process.env.VAPID_PUBLIC_KEY?.trim() || null;
  await recordView(client.id, "avisos", {
    push_available: Boolean(vapid), alerts_monitored: family.state !== "not_monitored",
    alerts_state: family.state, family_towns: family.towns.length, subscriptions: family.subscriptions,
  });
  return { props: { lang: client.language, vapid, family, tz: client.timezone, today: localDate(new Date(), client.timezone) } };
};

const SCRIPT = `(function(){
var m=document.querySelector("main[data-vapid]");if(!m||!("serviceWorker" in navigator)||!("PushManager" in window)||!window.Notification)return;
var key=m.getAttribute("data-vapid"),en=m.getAttribute("data-lang")==="en",on=document.getElementById("on"),off=document.getElementById("off"),msg=document.getElementById("msg"),ph=document.getElementById("ph");
function k(s){s=s.replace(/-/g,"+").replace(/_/g,"/");var r=atob(s+"===".slice((s.length+3)%4)),a=new Uint8Array(r.length);for(var i=0;i<r.length;i++)a[i]=r.charCodeAt(i);return a}
function say(es,e){msg.textContent=en?e:es;msg.hidden=false}
function show(s){on.hidden=!!s;off.hidden=!s;if(ph)ph.textContent=ph.getAttribute(s?"data-on":"data-off")}
function post(b){return fetch("/api/push",{method:"POST",headers:{"content-type":"application/json"},credentials:"same-origin",body:JSON.stringify(b)}).then(function(r){if(!r.ok)throw r.status})}
navigator.serviceWorker.register("/sw.js");
var ready=navigator.serviceWorker.ready;
ready.then(function(r){return r.pushManager.getSubscription()}).then(function(s){show(s);if(s)post({action:"subscribe",subscription:s.toJSON()}).catch(function(){})});
on.onclick=function(){Notification.requestPermission().then(function(p){
if(p!=="granted"){say("No diste permiso. Puedes activarlo en los ajustes del navegador.","Permission was not given. You can allow it in your browser settings.");return}
return ready.then(function(r){return r.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:k(key)})})
.then(function(s){return post({action:"subscribe",subscription:s.toJSON()}).then(function(){show(s);say("Listo: las notificaciones están activadas en este teléfono.","Done: notifications are on for this phone.")})})
}).catch(function(){say("No se pudo activar. Inténtalo otra vez con internet.","Could not turn them on. Try again when you are online.")})};
off.onclick=function(){ready.then(function(r){return r.pushManager.getSubscription()}).then(function(s){if(!s){show(null);return}
return post({action:"unsubscribe",endpoint:s.endpoint}).then(function(){return s.unsubscribe()}).then(function(){show(null);say("Las notificaciones están desactivadas en este teléfono.","Notifications are off for this phone.")})
}).catch(function(){say("No se pudo desactivar. Inténtalo otra vez con internet.","Could not turn them off. Try again when you are online.")})};
})();`;

export default function Avisos({ lang, vapid, family: f, tz, today }: Props) {
  const levels = f.push_levels ?? [];
  const monitored = f.state !== "not_monitored";
  const moment = (iso: string) => {
    const day = localDate(iso, tz);
    return day === today ? formatTime12(iso, tz) : `${formatTime12(iso, tz)}, ${formatDate(day, lang)}`;
  };
  const agencyLink = f.agency_url && f.agency && (
    <p><a href={f.agency_url} rel="noopener">{t(lang, `Ver avisos de ${f.agency}`, `See ${f.agency} warnings`)}</a></p>
  );
  const alertLine = !monitored
    ? t(lang, `Hoy todavía no recibe los avisos de ${f.agency ?? "tu país"}. Consúltalos en su página.`,
             `Hoy does not receive ${f.agency ?? "your country's"} warnings yet. Check their page.`)
    : levels.includes("orange")
      ? t(lang, `Alertas rojas y naranjas de ${f.agency} para tus municipios, en cuanto salen.`,
               `Red and orange warnings from ${f.agency} for your towns, as soon as they are issued.`)
      : t(lang, `Las alertas más graves (rojas) de ${f.agency} para tus municipios, en cuanto salen.`,
               `The most serious (red) warnings from ${f.agency} for your towns, as soon as they are issued.`);
  return (
    <>
      <Head>
        <title>{`${t(lang, "Notificaciones", "Notifications")} · Hoy`}</title>
        <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
        {monitored && <style dangerouslySetInnerHTML={{ __html: AVISOS_CSS }} />}
      </Head>
      <main data-vapid={vapid ?? undefined} data-lang={lang}>
        <PageHead lang={lang} title={t(lang, "Notificaciones", "Notifications")} art="bell" back />
        <p className="step">{monitored ? t(lang, "Te enviamos:", "We send you:") : t(lang, "Avisos del clima:", "Weather warnings:")}</p>
        <div className="tile">
          <Pic name="warning" />
          <span><p>{alertLine}</p>{!monitored && agencyLink}</span>
        </div>
        <div className="tile">
          <Pic name="bell" />
          <span><p>{t(lang, "Como máximo una más al día: tu equipo juega, la tasa más alta del mes, o la lotería.",
                          "At most one more a day: your team plays, the month's best rate, or the lottery.")}</p></span>
        </div>
        {monitored && <FamilyWarnings f={f} lang={lang} moment={moment} agencyLink={agencyLink} button={false} />}
        {vapid ? (
          <>
            <button id="on" type="button" hidden>{t(lang, "Activar en este teléfono", "Turn on for this phone")}</button>
            <button id="off" type="button" className="secondary" hidden>{t(lang, "Desactivar en este teléfono", "Turn off for this phone")}</button>
            <p id="msg" role="status" hidden></p>
            <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />
          </>
        ) : (
          <p>{t(lang, "Las notificaciones todavía no están disponibles.", "Notifications are not available yet.")}</p>
        )}
      </main>
      <TabBar current="mas" lang={lang} />
    </>
  );
}
