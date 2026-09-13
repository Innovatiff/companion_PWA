/**
 * The only JavaScript the home screen ships, inlined.
 *
 *  1. Offline honesty. A copy served from the service worker cache is the same
 *     HTML as before: same render id. Every line carries data-until; any line
 *     past it is removed, never shown stale, and the screen says when it was
 *     last updated.
 *  2. Instrumentation. Each open is queued with the lines actually on screen and
 *     whether it came from the cache, then sent to /api/open. A failed send
 *     stays queued for the next open; the server ignores duplicates.
 *  3. Registers the service worker.
 */
export const OPEN_SCRIPT = `(function(){
var m=document.querySelector("main[data-render]");if(!m)return;
var id=m.getAttribute("data-render"),en=m.getAttribute("data-lang")==="en",now=new Date();
function get(k){try{return JSON.parse(localStorage.getItem(k)||"[]")}catch(e){return[]}}
function put(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}
var seen=get("lc_seen"),cached=seen.indexOf(id)>=0;
if(!cached){seen.push(id);put("lc_seen",seen.slice(-20))}
var shown=[];
Array.prototype.forEach.call(m.querySelectorAll("[data-line]"),function(el){
if(Date.parse(el.getAttribute("data-until"))<=now.getTime())el.parentNode.removeChild(el);else shown.push(el.getAttribute("data-line"))});
if(cached){var s=document.getElementById("stamp"),t=new Date(m.getAttribute("data-rendered"));
s.textContent=(en?"Updated ":"Actualizado ")+t.toLocaleTimeString(en?"en-CA":"es-MX",{hour:"numeric",minute:"2-digit"});s.hidden=false}
var q=get("lc_q");q.push({render_id:id,opened_at:now.toISOString(),from_cache:cached,shown:shown});q=q.slice(-100);put("lc_q",q);
fetch("/api/open",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({opens:q}),keepalive:true,credentials:"same-origin"})
.then(function(r){if(r.status<500)put("lc_q",[])}).catch(function(){});
if("serviceWorker" in navigator)navigator.serviceWorker.register("/sw.js");
})();`;
