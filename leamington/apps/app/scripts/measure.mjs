// Transferred bytes for a cold and a warm load of the home screen, counted on
// the wire: compressed response bodies plus response headers, as a phone on
// metered data pays for them. Also confirms no framework JS is referenced.
//
//   BASE=http://localhost:3100 CODE=DEMOHN01 node scripts/measure.mjs
import http from "node:http";
import https from "node:https";

const BASE = new URL(process.env.BASE ?? "http://localhost:3100");
const client = BASE.protocol === "https:" ? https : http;
const CODE = process.env.CODE;
if (!CODE) { console.error("set CODE to a client code"); process.exit(2); }

function send(path, { method = "GET", cookie, form } = {}) {
  const data = form ? new URLSearchParams(form).toString() : typeof form === "string" ? form : null;
  const body = method === "POST" && !form ? arguments[1].json ?? null : data;
  return new Promise((resolve, reject) => {
    const headers = {
      "accept-encoding": "br, gzip",
      "user-agent": "Mozilla/5.0 (Linux; Android 11; SM-A022M) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36",
      accept: "text/html,*/*",
    };
    if (cookie) headers.cookie = cookie;
    if (body != null) {
      headers["content-type"] = form ? "application/x-www-form-urlencoded" : "application/json";
      headers["content-length"] = Buffer.byteLength(body);
    }
    const req = client.request({ host: BASE.hostname, port: BASE.port || undefined, path, method, headers }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const raw = Buffer.concat(chunks);
        let head = `HTTP/1.1 ${res.statusCode} ${res.statusMessage}\r\n`;
        for (let i = 0; i < res.rawHeaders.length; i += 2) head += `${res.rawHeaders[i]}: ${res.rawHeaders[i + 1]}\r\n`;
        resolve({
          label: `${method} ${path}`, status: res.statusCode, encoding: res.headers["content-encoding"] ?? "none",
          body: raw.length, headers: Buffer.byteLength(head + "\r\n"), raw,
          cookie: res.headers["set-cookie"]?.[0]?.split(";")[0],
          location: res.headers.location,
        });
      });
    });
    req.on("error", reject);
    if (body != null) req.write(body);
    req.end();
  });
}

const row = (r) => `  ${r.label.padEnd(30)} ${String(r.status).padEnd(4)} ${r.encoding.padEnd(5)} body ${String(r.body).padStart(6)}  headers ${String(r.headers).padStart(4)}  total ${String(r.body + r.headers).padStart(6)}`;
const total = (rs) => rs.reduce((s, r) => s + r.body + r.headers, 0);

// Cold: a new phone. The affiliate opens the app, the person types the code.
const cold = [];
cold.push(await send("/"));                                          // redirect to /login
cold.push(await send("/login"));
const login = await send("/api/login", { method: "POST", form: { code: CODE } });
cold.push(login);
const cookie = login.cookie;
if (!cookie) { console.error("login did not set a session cookie:", login.status, "->", login.location); process.exit(1); }
const home = await send("/", { cookie });
cold.push(home);
cold.push(await send("/sw.js"));                                     // registered by the inline script
cold.push(await send("/manifest.webmanifest"));                      // <link rel="manifest">
const zlib = await import("node:zlib");
const decode = (r) => r.encoding === "gzip" ? zlib.gunzipSync(r.raw).toString()
  : r.encoding === "br" ? zlib.brotliDecompressSync(r.raw).toString() : r.raw.toString();
const renderId = /data-render="([^"]+)"/.exec(decode(home))?.[1];
if (!renderId) { console.error("no render id in the home screen HTML"); process.exit(1); }
cold.push(await send("/api/open", { method: "POST", cookie, json: JSON.stringify({ opens: [{ render_id: renderId, opened_at: new Date().toISOString(), from_cache: false, shown: ["greeting"] }] }) }));

const install = [await send("/icon-192.png"), await send("/icon-512.png")];

// Warm: the next morning. Service worker installed; manifest and icons come
// from its cache. The home screen itself is always fetched fresh (network first).
const warm = [await send("/", { cookie })];
warm.push(await send("/api/open", { method: "POST", cookie, json: JSON.stringify({ opens: [] }) }));

const html = home.raw;
const decoded = home.encoding === "gzip" ? (await import("node:zlib")).gunzipSync(html).toString()
  : home.encoding === "br" ? (await import("node:zlib")).brotliDecompressSync(html).toString() : html.toString();
const scripts = [...decoded.matchAll(/<script\b[^>]*>/g)].map((m) => m[0]);
const external = scripts.filter((s) => /\bsrc=/.test(s));

console.log("Cold load, first visit and sign-in");
cold.forEach((r) => console.log(row(r)));
console.log(`  TOTAL ${total(cold)} bytes`);
console.log("\nInstall extras (fetched by Chrome for the home-screen icon)");
install.forEach((r) => console.log(row(r)));
console.log(`  TOTAL ${total(install)} bytes`);
console.log("\nWarm load, the next open");
warm.forEach((r) => console.log(row(r)));
console.log(`  TOTAL ${total(warm)} bytes`);
// Every page a signed-in client opens, fetched fresh as on a warm open (the
// service worker never caches section pages). Budget: 12,000 bytes each.
const PAGES = ["/", "/futbol", "/clima", "/clima/aqui", "/mas", "/mas/miembro", "/mas/semana", "/mas/tasa", "/mas/feriados", "/mas/escuela", "/mas/consulado",
  "/mas/emergencias", "/mas/transporte", "/mas/loteria", "/mas/avisos", "/setup/municipality?edit=1"];
const WARM_BUDGET = 12_000, COLD_BUDGET = 25_000, ART_BUDGET = 1_500;
const arts = new Set();
console.log(`\nWarm pages, one fresh fetch each (budget ${WARM_BUDGET} bytes)`);
for (const path of PAGES) {
  const r = await send(path, { cookie });
  for (const m of decode(r).matchAll(/\/art\/[a-z-]+\.svg\?v=\d+/g)) arts.add(m[0]);
  console.log(`${row(r)}${r.body + r.headers > WARM_BUDGET ? "  OVER" : ""}`);
}
const signin = await send("/login");
for (const m of decode(signin).matchAll(/\/art\/[a-z-]+\.svg\?v=\d+/g)) arts.add(m[0]);

// Illustrations: fetched once, then cached for 30 days; not counted in the page budgets.
console.log(`\nIllustrations referenced (budget ${ART_BUDGET} bytes gzipped each; cached, outside page budgets)`);
let artTotal = 0;
for (const path of [...arts].sort()) {
  const r = await send(path);
  artTotal += r.body + r.headers;
  // Files under 1 KB are sent uncompressed (below the server's gzip threshold); the limit is on size.
  console.log(`${row(r)}${r.body > ART_BUDGET ? "  OVER" : ""}`);
}
console.log(`  ${arts.size} files, TOTAL ${artTotal} bytes the first time`);
console.log(`\nBudgets: cold sign-in + home ${total(cold)} / ${COLD_BUDGET} ${total(cold) <= COLD_BUDGET ? "ok" : "OVER"}`);

console.log(`\nHome HTML: ${html.length} bytes on the wire, ${Buffer.byteLength(decoded)} decoded`);
console.log(`<script> tags: ${scripts.length}; with src (framework or external JS): ${external.length}${external.length ? " -> " + external.join(" ") : ""}`);
console.log(`references to /_next/: ${(decoded.match(/\/_next\//g) ?? []).length}`);
