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
  } else if (STATIC.includes(url.pathname)) {
    event.respondWith(staticAsset(req));
  }
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
