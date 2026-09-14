// Offline cache of the last home screen.
//
// Network first: on a working connection the person always gets a fresh
// render. The cached copy is used only when the network fails, or has not
// answered within 4 seconds. Each line in that copy carries its own expiry, and
// the page removes expired lines rather than show them stale.
//
// Nothing is precached on install, so installing the worker costs no bytes. The
// manifest and icons are cached the first time the browser asks for them.

const CACHE = "home-v1";
const STATIC = ["/manifest.webmanifest", "/icon-192.png", "/icon-512.png"];
const TIMEOUT_MS = 4000;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;

  if (req.mode === "navigate" && url.pathname === "/") {
    event.respondWith(home(req));
  } else if (req.mode === "navigate") {
    // Section pages are never cached: they have no per-line expiry, and an old
    // warning list must not be shown as the list. Offline, say so plainly.
    event.respondWith(fetch(req).catch(() => offline()));
  } else if (STATIC.includes(url.pathname) || url.pathname.startsWith("/art/")) {
    // Illustrations are versioned (?v=), so a cached copy is never out of date,
    // and an offline home screen keeps its pictures.
    event.respondWith(staticAsset(req));
  }
});

function offline() {
  const html = '<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Hoy</title><body style="margin:0;font:18px/1.45 system-ui,sans-serif;color:#10231c;background:#f6f3ea">' +
    '<main style="max-width:34rem;margin:0 auto;padding:1rem"><h1 style="font-size:1.55rem">Sin conexión</h1>' +
    '<p>Esta página necesita internet. <a href="/">Inicio</a> muestra lo último que guardamos.</p>' +
    '<p><small>No connection. This page needs the internet. <a href="/">Home</a> shows what we saved last.</small></p></main>';
  return new Response(html, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

// Push. The sender (services/ingest) sends {title, body, url, tag, queue}.
// Every alert has its own tag, so a second warning never replaces the first.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const alert = data.queue === "alert";
  event.waitUntil(self.registration.showNotification(data.title || "Hoy", {
    body: data.body || "",
    tag: data.tag || undefined,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { url: typeof data.url === "string" && data.url.startsWith("/") ? data.url : "/" },
    requireInteraction: alert,
    renotify: Boolean(alert && data.tag),
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const w of windows) {
        if (new URL(w.url).origin === self.location.origin && "focus" in w) {
          return w.navigate(url).then((nav) => (nav || w).focus());
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});

async function home(req) {
  const cache = await caches.open(CACHE);
  const network = fetch(req).then((res) => {
    // Only a real home screen is cached; a redirect to /login is not.
    if (res.ok && res.type === "basic" && !res.redirected) cache.put("/", res.clone());
    return res;
  });
  network.catch(() => {});

  const timeout = new Promise((resolve) => setTimeout(resolve, TIMEOUT_MS, null));
  try {
    const first = await Promise.race([network, timeout]);
    if (first) return first;
    return (await cache.match("/")) || network;
  } catch (err) {
    const cached = await cache.match("/");
    if (cached) return cached;
    throw err;
  }
}

async function staticAsset(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}
