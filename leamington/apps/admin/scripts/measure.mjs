// Transferred bytes for the owner portal, counted on the wire: compressed
// response bodies plus response headers. Also confirms no framework JS.
//
//   BASE=http://localhost:3300 LOGIN=owner PASSWORD=... node scripts/measure.mjs
//
// Budget (docs/DESIGN.md): admin pages <= 40 KB cold, <= 20 KB warm.
import http from "node:http";
import zlib from "node:zlib";

const BASE = new URL(process.env.BASE ?? "http://localhost:3300");
const { LOGIN, PASSWORD } = process.env;
if (!LOGIN || !PASSWORD) { console.error("set LOGIN and PASSWORD for an owner account"); process.exit(2); }
const COLD_BUDGET = 40 * 1024, WARM_BUDGET = 20 * 1024;

function send(path, { method = "GET", cookie, form } = {}) {
  const body = form ? new URLSearchParams(form).toString() : null;
  return new Promise((resolve, reject) => {
    const headers = {
      "accept-encoding": "br, gzip",
      "user-agent": "Mozilla/5.0 (Linux; Android 11; SM-A022M) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36",
      accept: "text/html,*/*",
    };
    if (cookie) headers.cookie = cookie;
    if (body != null) {
      headers["content-type"] = "application/x-www-form-urlencoded";
      headers["content-length"] = Buffer.byteLength(body);
      headers.origin = BASE.origin;
    }
    const req = http.request({ host: BASE.hostname, port: BASE.port, path, method, headers }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const raw = Buffer.concat(chunks);
        let head = `HTTP/1.1 ${res.statusCode} ${res.statusMessage}\r\n`;
        for (let i = 0; i < res.rawHeaders.length; i += 2) head += `${res.rawHeaders[i]}: ${res.rawHeaders[i + 1]}\r\n`;
        const encoding = res.headers["content-encoding"] ?? "none";
        const decoded = encoding === "gzip" ? zlib.gunzipSync(raw).toString()
          : encoding === "br" ? zlib.brotliDecompressSync(raw).toString() : raw.toString();
        resolve({
          label: `${method} ${path}`, status: res.statusCode, encoding, body: raw.length, headers: Buffer.byteLength(head + "\r\n"),
          decoded, cookie: res.headers["set-cookie"]?.[0]?.split(";")[0], location: res.headers.location,
        });
      });
    });
    req.on("error", reject);
    if (body != null) req.write(body);
    req.end();
  });
}

const size = (r) => r.body + r.headers;
const row = (r, budget) => `  ${r.label.padEnd(20)} ${String(r.status).padEnd(4)} ${r.encoding.padEnd(5)} body ${String(r.body).padStart(6)}  headers ${String(r.headers).padStart(4)}  total ${String(size(r)).padStart(6)}  decoded ${String(Buffer.byteLength(r.decoded)).padStart(6)}${budget ? `  ${size(r) <= budget ? "within" : "OVER"} ${budget / 1024} KB` : ""}`;
const total = (rs) => rs.reduce((s, r) => s + size(r), 0);

// Cold: a new browser, no cookie. Sign-in page, sign in, the sales page.
const cold = [await send("/login")];
const login = await send("/api/login", { method: "POST", form: { login: LOGIN, password: PASSWORD } });
cold.push(login);
if (!login.cookie) { console.error("sign-in did not set a cookie:", login.status, "->", login.location); process.exit(1); }
const cookie = login.cookie;
cold.push(await send("/", { cookie }));

// Warm: the same browser later. The portals have no offline cache; HTML is always fetched.
const warm = [
  await send("/", { cookie }), await send("/clients", { cookie }),
  await send("/renewals", { cookie }), await send("/renewals/log", { cookie }),
];

let ok = true;
console.log("Cold load, first visit and sign-in");
cold.forEach((r) => console.log(row(r, r.label.startsWith("GET") ? COLD_BUDGET : 0)));
console.log(`  TOTAL ${total(cold)} bytes (${(total(cold) / 1024).toFixed(1)} KB) — ${total(cold) <= COLD_BUDGET ? "within" : "OVER"} the 40 KB cold budget`);
console.log("\nWarm load");
warm.forEach((r) => console.log(row(r, WARM_BUDGET)));
console.log(`  TOTAL ${total(warm)} bytes (${(total(warm) / 1024).toFixed(1)} KB) — ${total(warm) <= WARM_BUDGET ? "within" : "OVER"} the 20 KB warm budget`);

for (const r of [...cold, ...warm]) {
  if (r.status >= 400) ok = false;
  const scripts = [...r.decoded.matchAll(/<script\b[^>]*>/g)].map((m) => m[0]);
  const external = scripts.filter((s) => /\bsrc=/.test(s));
  const next = (r.decoded.match(/\/_next\//g) ?? []).length;
  if (external.length || next) { ok = false; console.log(`${r.label}: ${external.length} <script src>, ${next} /_next/ references`); }
}
console.log(`\n<script src> and /_next/ references across these pages: ${ok ? "none" : "FOUND"}`);
if (total(cold) > COLD_BUDGET || warm.some((r) => size(r) > WARM_BUDGET) || cold.some((r) => r.label.startsWith("GET") && size(r) > COLD_BUDGET)) ok = false;
process.exit(ok ? 0 : 1);
