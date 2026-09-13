/**
 * Notificaciones: turn push on or off for this phone.
 *
 * Subscribing needs the browser's Push API, so this is the one section page
 * with a script of its own (inline, about 1.5 KB). Without it, or without push
 * support, the buttons stay hidden and the page says only what we send.
 */
import Head from "next/head";
import type { GetServerSideProps } from "next";
import { TabBar } from "@leamington/shared/src/ui/TabBar.tsx";
import { db } from "../../lib/db";
import { loadClient, recordView } from "../../lib/client";
import { t } from "../../lib/t";

export const config = { unstable_runtimeJS: false };

type Props = { lang: "es" | "en"; vapid: string | null; pushLevels: string[] | null; agency: string | null };

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  // Alert notifications continue after a paid period ends, so this stays open.
  const loaded = await loadClient(ctx, { allowUnpaid: true });
  if ("redirect" in loaded) return loaded;
  const { client } = loaded;
  const { rows } = await db().query(
    `select agency, push_levels::text[] as push_levels from alert_sources
      where country = $1 and active order by (kind = 'cap') desc limit 1`, [client.country]);
  const vapid = process.env.VAPID_PUBLIC_KEY?.trim() || null;
  await recordView(client.id, "avisos", { push_available: Boolean(vapid), alerts_monitored: rows.length > 0 });
  return { props: { lang: client.language, vapid, pushLevels: rows[0]?.push_levels ?? null, agency: rows[0]?.agency ?? null } };
};

const SCRIPT = `(function(){
var m=document.querySelector("main[data-vapid]");if(!m||!("serviceWorker" in navigator)||!("PushManager" in window)||!window.Notification)return;
var key=m.getAttribute("data-vapid"),en=m.getAttribute("data-lang")==="en",on=document.getElementById("on"),off=document.getElementById("off"),msg=document.getElementById("msg");
function k(s){s=s.replace(/-/g,"+").replace(/_/g,"/");var r=atob(s+"===".slice((s.length+3)%4)),a=new Uint8Array(r.length);for(var i=0;i<r.length;i++)a[i]=r.charCodeAt(i);return a}
function say(es,e){msg.textContent=en?e:es;msg.hidden=false}
function show(s){on.hidden=!!s;off.hidden=!s}
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

export default function Avisos({ lang, vapid, pushLevels, agency }: Props) {
  const levels = pushLevels ?? [];
  const alertLine = !agency
    ? t(lang, "Todavía no enviamos alertas del clima de tu país.", "We do not send weather warnings for your country yet.")
    : levels.includes("orange")
      ? t(lang, `Alertas rojas y naranjas de ${agency} para tus municipios, en cuanto salen.`,
               `Red and orange warnings from ${agency} for your towns, as soon as they are issued.`)
      : t(lang, `Las alertas más graves (rojas) de ${agency} para tus municipios, en cuanto salen.`,
               `The most serious (red) warnings from ${agency} for your towns, as soon as they are issued.`);
  return (
    <>
      <Head>
        <title>{`${t(lang, "Notificaciones", "Notifications")} · Hoy`}</title>
        <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
      </Head>
      <main data-vapid={vapid ?? undefined} data-lang={lang}>
        <p><a href="/mas">← {t(lang, "Más", "More")}</a></p>
        <h1>{t(lang, "Notificaciones", "Notifications")}</h1>
        <p>{t(lang, "Te enviamos:", "We send you:")}</p>
        <ul>
          <li>{alertLine}</li>
          <li>{t(lang, "Como máximo una más al día: tu equipo juega, la tasa más alta del mes, o la lotería.",
                        "At most one more a day: your team plays, the month's best rate, or the lottery.")}</li>
        </ul>
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
