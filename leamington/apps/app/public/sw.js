// Hoy's service worker: pages that work without internet.
//
// Saved pages (Inicio, Clima, Hoy en Leamington, Tasa, Miembro, Tu semana, Noticias):
// network first. On a working connection the member always gets a fresh render,
// and that render is kept. When the network fails, or has not answered within 4
// seconds, the last kept copy is served with its "Sin conexión · guardado a las
// ..." line revealed (the page renders it hidden, with its own render time).
// Every time-bound element in those pages carries data-until, and the pages'
// inline script removes whatever has expired, so a saved copy never shows an old
// "Ahora", hour, air reading or clock as current.
//
// Other pages are never kept: offline, they say so plainly.
//
// Privacy: visiting the sign-in page, or signing in, clears every kept page, so
// a shared phone never shows the previous member's pages.
//
// Nothing is precached on install. The manifest, icons and illustrations are
// cached the first time the browser asks for them (illustrations are versioned).

const STATIC = "static-v2";
const PAGES = "pages-v1";
const SAVED = ["/", "/clima", "/clima/aqui", "/mas/tasa", "/mas/miembro", "/mas/semana", "/noticias"];
const STATIC_PATHS = ["/manifest.webmanifest", "/icon-192.png", "/icon-512.png"];
const TIMEOUT_MS = 4000;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== STATIC && k !== PAGES).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Signing in (any code) starts from nothing kept.
  if (req.method === "POST" && url.pathname === "/api/login") {
    event.waitUntil(clearPages());
    return;
  }
  if (req.method !== "GET") return;

  if (req.mode === "navigate" && url.pathname === "/login") {
    event.waitUntil(clearPages());
    event.respondWith(fetch(req).catch(() => offline()));
  } else if (req.mode === "navigate" && SAVED.includes(url.pathname)) {
    event.respondWith(saved(req, url));
  } else if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => offline()));
  } else if (STATIC_PATHS.includes(url.pathname) || url.pathname.startsWith("/art/")) {
    event.respondWith(staticAsset(req));
  }
});

function clearPages() {
  return caches.delete(PAGES);
}

function offline() {
  const html = '<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Hoy</title><body style="margin:0;font:18px/1.45 system-ui,sans-serif;color:#1b1f3b;background:#eef0fb">' +
    '<main style="max-width:34rem;margin:0 auto;padding:1rem"><h1 style="font-size:1.55rem">Sin conexión</h1>' +
    '<p>Esta página necesita internet. <a href="/">Inicio</a> muestra lo último que guardamos.</p>' +
    '<p><small>No connection. This page needs the internet. <a href="/">Home</a> shows what we saved last.</small></p></main>';
  return new Response(html, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

// A kept copy, with its offline line revealed.
async function marked(res) {
  const text = (await res.text()).replace(/(<p[^>]*\bid="off"[^>]*?) hidden=""/, "$1");
  return new Response(text, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

async function saved(req, url) {
  const cache = await caches.open(PAGES);
  // The page as it opens (no query string) is the one kept: ?r=90 or a
  // calculation is fetched fresh and falls back to the plain page offline.
  const key = url.pathname;
  const network = fetch(req).then((res) => {
    if (res.ok && res.type === "basic" && !res.redirected && url.search === "") cache.put(key, res.clone());
    return res;
  });
  network.catch(() => {});

  const timeout = new Promise((resolve) => setTimeout(resolve, TIMEOUT_MS, null));
  try {
    const first = await Promise.race([network, timeout]);
    if (first) return first;
    const kept = await cache.match(key);
    return kept ? marked(kept) : network;
  } catch (err) {
    const kept = await cache.match(key);
    if (kept) return marked(kept);
    return offline();
  }
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

async function staticAsset(req) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}
