/**
 * The news feed against a throwaway local Postgres (helpers/local-db.mjs),
 * with fetch mocked: stored stories, pictures and mentions; dedupe by guid and
 * across outlets; og:image; the per-run picture cap; a failing outlet makes
 * the run partial, every outlet failing makes it an error; pruning.
 * Skipped when no local Postgres is running.
 *   TEST_PGPORT=55433 node --test test/news-ingest.test.mjs
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

import { localDbUnavailable, useFreshDatabase } from "./helpers/local-db.mjs";
import { photoJpeg } from "./helpers/news-images.mjs";

const unavailable = localDbUnavailable();
// The real clock: app.news_page counts a run only once it has finished, at or before its p_now.
const NOW = new Date();
let query, closePool, runFeed, ingestNews;

before(async () => {
  if (unavailable) return;
  useFreshDatabase("leamington_ingest_test_news");
  ({ query, closePool } = await import("../src/db.mjs"));
  ({ runFeed } = await import("../src/run-feed.mjs"));
  ({ ingestNews } = await import("../src/feeds/news.mjs"));
  await query(`update news_sources set active = false`);   // the seeded outlets are never fetched in tests
  await query(`insert into affiliates (id, name) values ('99990000-0000-4000-8000-0000000004a0', 'News Ingest Test')`);
  await query(
    `insert into clients (id, affiliate_id, code, full_name, country, language, municipality_id, municipality, timezone)
     select '99990000-0000-4000-8000-0000000004a1', '99990000-0000-4000-8000-0000000004a0', 'ZECTAQ42', 'News Person', 'HN', 'es', m.id, m.name, 'America/Toronto'
       from municipalities m where m.country = 'HN' and m.admin_region = 'Cortés' and m.name = 'San Pedro Sula'`);
  await query(
    `insert into news_sources (key, name, country, admin_region, homepage_url, feed_url, language, verified_at) values
       ('t-a', 'Outlet A', 'HN', null,     'https://a.example/', 'https://a.example/feed', 'es', '2026-09-14'),
       ('t-b', 'Outlet B', 'HN', null,     'https://b.example/', 'https://b.example/feed', 'es', '2026-09-14'),
       ('t-c', 'Outlet C', 'HN', 'Cortés', 'https://c.example/', 'https://c.example/feed', 'es', '2026-09-14')`);
});
after(async () => { if (!unavailable) await closePool(); });

const rss = (items) => `<?xml version="1.0"?><rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel><title>t</title>${items.map((i) =>
  `<item><title><![CDATA[${i.title}]]></title><link>${i.link}</link>${i.guid ? `<guid isPermaLink="false">${i.guid}</guid>` : ""}<pubDate>${i.date.toUTCString()}</pubDate><description><![CDATA[<p>${i.desc ?? ""}</p>]]></description>${i.img ? `<media:content url="${i.img}" medium="image"/>` : ""}</item>`).join("")}</channel></rss>`;
const hoursAgo = (h) => new Date(NOW.getTime() - h * 3600e3);

/** fetch from a route table: {url: {body, type, status}} | Error. Unknown urls fail like a dead host. */
function mockFetch(routes) {
  const calls = [];
  const f = async (url) => {
    const u = String(url);
    calls.push(u);
    const r = routes[u];
    if (r instanceof Error || r === undefined) throw new TypeError("fetch failed", { cause: { code: r ? "ECONNRESET" : "ENOTFOUND" } });
    return new Response(r.body, { status: r.status ?? 200, headers: { "content-type": r.type ?? "application/rss+xml; charset=utf-8" } });
  };
  f.calls = calls;
  return f;
}
const jpg = (w = 800, h = 600) => ({ body: photoJpeg(w, h), type: "image/jpeg" });
const count = async (sql, params) => Number((await query(sql, params)).rows[0].n);

test("a run: stories, pictures, og:image, mentions, dedupe across outlets, a failing outlet is partial", { skip: unavailable ?? false }, async () => {
  const routes = {
    "https://a.example/feed": { body: rss([
      { title: "¿Habrá Ley Seca en SPS este 15 de septiembre?", link: "https://a.example/ley-seca", guid: "a-1", date: hoursAgo(2), desc: "San Pedro Sula, Honduras. Los sampedranos...", img: "https://img.example/a1.jpg" },
      { title: "Crisis hídrica en la capital", link: "https://a.example/agua", guid: "a-2", date: hoursAgo(3), desc: "Pozos habilitados." },
      { title: "Una nota de hace 31 días", link: "https://a.example/vieja", guid: "a-3", date: hoursAgo(31 * 24) },
    ]) },
    "https://b.example/feed": new Error("dead"),
    "https://c.example/feed": { body: rss([
      { title: "Ley Seca en SPS (copia)", link: "https://www.a.example/ley-seca/?utm_source=rss", guid: "c-1", date: hoursAgo(1) },
      { title: "Feria juniana", link: "https://c.example/feria", guid: "c-2", date: hoursAgo(5), img: "https://img.example/c2.png" },
    ]) },
    "https://img.example/a1.jpg": jpg(1200, 900),
    "https://a.example/agua": { body: `<html><head><meta property="og:image" content="https://img.example/agua.jpg"></head></html>`, type: "text/html" },
    "https://img.example/agua.jpg": jpg(1024, 683),
    "https://img.example/c2.png": { body: "<html>not a picture</html>", type: "text/html" },
  };
  const fetchImpl = mockFetch(routes);
  const r = await runFeed("news", (ctx) => ingestNews(ctx, { fetchImpl, now: NOW }));
  assert.equal(r.status, "partial");
  assert.equal(r.recordsWritten, 3, "a-1, a-2, c-2 (c-1 is a-1's url, a-3 is too old)");

  const run = (await query(`select status, notes from source_runs where feed = 'news' order by id desc limit 1`)).rows[0];
  assert.match(JSON.stringify(run.notes), /t-b: ENOTFOUND|t-b: ECONNRESET/);

  const items = (await query(`select i.guid, i.url, i.summary, i.image_id, s.key from news_items i join news_sources s on s.id = i.source_id order by i.guid`)).rows;
  assert.deepEqual(items.map((i) => i.guid), ["a-1", "a-2", "c-2"]);
  assert.equal(items[0].summary, "San Pedro Sula, Honduras. Los sampedranos...");
  assert.ok(items[0].image_id && items[1].image_id, "feed picture and og:image picture");
  assert.equal(items[2].image_id, null, "a failed picture: the story is stored without one");

  const img = (await query(`select octet_length(thumb) t, thumb_width, thumb_height, octet_length(lead) l, lead_width, lead_height, source_url from news_images where id = $1`, [items[0].image_id])).rows[0];
  assert.deepEqual([img.thumb_width, img.thumb_height, img.lead_width, img.lead_height], [160, 120, 480, 360]);
  assert.ok(img.t <= 10_000 && img.l <= 45_000, JSON.stringify(img));
  assert.equal(img.source_url, "https://img.example/a1.jpg");

  const m = (await query(`select i.guid, mu.name, nm.matched, nm.rule from news_mentions nm join news_items i on i.id = nm.item_id join municipalities mu on mu.id = nm.municipality_id`)).rows;
  assert.deepEqual(m, [{ guid: "a-1", name: "San Pedro Sula", matched: "SPS", rule: "alias" }],
    "the summary's \"San Pedro Sula, Honduras.\" is La Prensa's newsroom dateline; the headline's SPS names the city");

  // The database's clock: the run has finished by now, so the news is current.
  const page = (await query(`select app.news_page('99990000-0000-4000-8000-0000000004a1') p`)).rows[0].p;
  assert.equal(page.local[0].title, "¿Habrá Ley Seca en SPS este 15 de septiembre?");
  assert.deepEqual(page.local[0].mentions, ["San Pedro Sula"]);
  assert.equal(page.region[0].title, "Feria juniana");
  assert.equal(page.stale, false);

  // The same feeds again: nothing new, no second picture, no page read again.
  const again = mockFetch(routes);
  const r2 = await runFeed("news", (ctx) => ingestNews(ctx, { fetchImpl: again, now: NOW }));
  assert.equal(r2.recordsWritten, 0);
  assert.equal(await count(`select count(*) n from news_images`), 2);
  assert.ok(!again.calls.some((u) => u.startsWith("https://img.example/") || u === "https://a.example/agua"), again.calls.join(" "));
});

test("the picture cap per run, and an outlet's repeated default picture", { skip: unavailable ?? false }, async () => {
  await query(`delete from news_items`);
  await query(`delete from news_images`);
  const items = Array.from({ length: 6 }, (_, i) => ({ title: `Nota ${i}`, link: `https://a.example/n${i}`, guid: `cap-${i}`, date: hoursAgo(i + 1), img: `https://img.example/n${i}.jpg` }));
  const logo = [7, 8, 9].map((i) => ({ title: `Con logo ${i}`, link: `https://c.example/l${i}`, guid: `logo-${i}`, date: hoursAgo(i), img: "https://img.example/logo-default.jpg" }));
  const routes = {
    "https://a.example/feed": { body: rss(items) },
    "https://b.example/feed": { body: rss([]) },
    "https://c.example/feed": { body: rss(logo) },
    "https://img.example/logo-default.jpg": jpg(),
  };
  for (let i = 0; i < 6; i++) routes[`https://img.example/n${i}.jpg`] = i === 0 ? { body: "", status: 404, type: "image/jpeg" } : jpg(640 + i, 480);
  for (const i of [7, 8, 9]) routes[`https://c.example/l${i}`] = { body: "<html><head></head></html>", type: "text/html" };
  const fetchImpl = mockFetch(routes);
  const r = await runFeed("news", (ctx) => ingestNews(ctx, { fetchImpl, now: NOW, imageCap: 3, pageCap: 1 }));
  assert.equal(r.status, "ok", "an outlet with no items and pictures that fail do not make a run partial");
  assert.equal(r.recordsWritten, 9, "every story is stored, with or without a picture");
  const imageCalls = fetchImpl.calls.filter((u) => u.startsWith("https://img.example/"));
  assert.equal(imageCalls.length, 3, imageCalls.join(" "));
  assert.ok(!imageCalls.includes("https://img.example/logo-default.jpg"), "a picture on 3 stories is the outlet's default");
  assert.equal(fetchImpl.calls.filter((u) => u.startsWith("https://c.example/l")).length, 1, "article pages are capped too");
  assert.equal(await count(`select count(*) n from news_items where image_id is not null`), 2, "3 tried, the 404 failed");
  assert.equal(await count(`select count(*) n from news_items where image_checked_at is null`), 5, "a3-a5 (picture budget), l8-l9 (page budget)");

  // The next run: no new stories, and the ones skipped for budget get their look, newest first.
  const next = mockFetch(routes);
  const r2 = await runFeed("news", (ctx) => ingestNews(ctx, { fetchImpl: next, now: NOW, imageCap: 10, pageCap: 10 }));
  assert.equal(r2.recordsWritten, 0);
  assert.deepEqual(next.calls.filter((u) => u.startsWith("https://img.example/")).sort(),
    ["https://img.example/n3.jpg", "https://img.example/n4.jpg", "https://img.example/n5.jpg"], "the 404 (checked) is not tried again");
  assert.deepEqual(next.calls.filter((u) => u.startsWith("https://c.example/l")).sort(), ["https://c.example/l8", "https://c.example/l9"]);
  assert.equal(await count(`select count(*) n from news_items where image_id is not null`), 5);
  assert.equal(await count(`select count(*) n from news_items where image_checked_at is null`), 0);

  const third = mockFetch(routes);
  await runFeed("news", (ctx) => ingestNews(ctx, { fetchImpl: third, now: NOW }));
  assert.ok(!third.calls.some((u) => u.startsWith("https://img.example/") || u.startsWith("https://c.example/l")), third.calls.join(" "));
});

test("no graphic pictures: a violence story keeps its text, its picture is never fetched; an outlet with pictures off", { skip: unavailable ?? false }, async () => {
  await query(`delete from news_items`);
  await query(`delete from news_images`);
  await query(`update news_sources set show_images = false where key = 't-c'`);
  const routes = {
    "https://a.example/feed": { body: rss([
      { title: "¡Crímenes no paran! A balazos ultiman un joven en San Pedro Sula", link: "https://a.example/crimen", guid: "g-1", date: hoursAgo(1), img: "https://img.example/crimen.jpg" },
      { title: "Día de Muertos: San Pedro Sula prepara altares", link: "https://a.example/altares", guid: "g-2", date: hoursAgo(2), img: "https://img.example/altares.jpg" },
    ]) },
    "https://b.example/feed": { body: rss([]) },
    "https://c.example/feed": { body: rss([
      { title: "Feria en San Pedro Sula", link: "https://c.example/feria2", guid: "g-3", date: hoursAgo(3), img: "https://img.example/feria.jpg" },
    ]) },
    "https://img.example/crimen.jpg": jpg(),
    "https://img.example/altares.jpg": jpg(),
    "https://img.example/feria.jpg": jpg(),
  };
  const fetchImpl = mockFetch(routes);
  const r = await runFeed("news", (ctx) => ingestNews(ctx, { fetchImpl, now: NOW }));
  assert.equal(r.recordsWritten, 3);
  assert.deepEqual(fetchImpl.calls.filter((u) => u.startsWith("https://img.example/")), ["https://img.example/altares.jpg"], "only the non-graphic story of an outlet with pictures on");
  const rows = (await query(`select guid, image_id is not null as has_image, image_suppressed, image_checked_at is not null as checked from news_items order by guid`)).rows;
  assert.deepEqual(rows, [
    { guid: "g-1", has_image: false, image_suppressed: "a balazos", checked: true },
    { guid: "g-2", has_image: true, image_suppressed: null, checked: true },
    { guid: "g-3", has_image: false, image_suppressed: null, checked: false },
  ]);
  const page = (await query(`select app.news_page('99990000-0000-4000-8000-0000000004a1') p`)).rows[0].p;
  const byTitle = Object.fromEntries([...page.local, ...page.region, ...page.national].map((i) => [i.title.slice(0, 12), i.image]));
  assert.deepEqual(byTitle, { "¡Crímenes no": false, "Día de Muert": true, "Feria en San": false }, JSON.stringify(byTitle));

  // Pictures back on for the outlet: the next run fetches the story it skipped, still never the graphic one.
  await query(`update news_sources set show_images = true where key = 't-c'`);
  const next = mockFetch(routes);
  await runFeed("news", (ctx) => ingestNews(ctx, { fetchImpl: next, now: NOW }));
  assert.deepEqual(next.calls.filter((u) => u.startsWith("https://img.example/")), ["https://img.example/feria.jpg"]);
  assert.equal(await count(`select count(*) n from news_items where guid = 'g-3' and image_id is not null`), 1);
});

test("every outlet failing is an error (inconclusive), never an empty news run; pruning", { skip: unavailable ?? false }, async () => {
  const fetchImpl = mockFetch({
    "https://a.example/feed": { body: "<!doctype html><html>Just a moment...</html>", type: "text/html" },
    "https://b.example/feed": { body: "Forbidden", status: 403, type: "text/html" },
  });
  const r = await runFeed("news", (ctx) => ingestNews(ctx, { fetchImpl, now: NOW }));
  assert.equal(r.status, "error");
  assert.equal(r.sourceResult, "no_answer");
  const run = (await query(`select error from source_runs where feed = 'news' order by id desc limit 1`)).rows[0];
  assert.match(run.error, /no news source answered \(3 tried\).*t-a: not a feed \(an HTML page\).*t-b: HTTP 403.*t-c: ENOTFOUND/);

  const before = await count(`select count(*) n from news_items`);
  await query(
    `insert into news_items (source_id, guid, url, url_key, title, published_at)
     select id, 'old', 'https://a.example/old', 'a.example/old', 'Old', $1::timestamptz - interval '31 days' from news_sources where key = 't-a'`, [NOW]);
  const ok = await runFeed("news", (ctx) => ingestNews(ctx, { fetchImpl: mockFetch({ "https://a.example/feed": { body: rss([]) } }), now: NOW }));
  assert.equal(ok.status, "partial");
  assert.equal(await count(`select count(*) n from news_items where guid = 'old'`), 0);
  assert.equal(await count(`select count(*) n from news_items`), before);
});
