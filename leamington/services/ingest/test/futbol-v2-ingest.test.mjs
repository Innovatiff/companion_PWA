/**
 * Fútbol v2 feeds against a throwaway local Postgres (helpers/local-db.mjs),
 * fetch mocked: Shorts kept or skipped, their /shorts/ url and 180 x 320
 * thumbnail from hqdefault.jpg; categories and is_highlight; national teams from
 * a federation channel and from match titles; a confederation channel's club
 * match; 0049 videos classified later; news stories matched to clubs at ingest,
 * stored stories backfilled, a country without clubs left unchecked, and
 * app.team_news. Skipped when no local Postgres is running.
 *   TEST_PGPORT=55433 node --test test/futbol-v2-ingest.test.mjs
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

import { localDbUnavailable, useFreshDatabase } from "./helpers/local-db.mjs";
import { photoJpeg } from "./helpers/news-images.mjs";

const unavailable = localDbUnavailable();
const NOW = new Date();
let query, closePool, runFeed, ingestVideos, ingestNews;

const CH = { league: "UCv2league00000000000aaa", tv: "UCv2tv000000000000000aaa", fmf: "UCv2fmf00000000000000aaa", conf: "UCv2concacaf000000000aaa" };
const CLIENT = "99990000-0000-4000-8000-0000000006a1";

before(async () => {
  if (unavailable) return;
  useFreshDatabase("leamington_ingest_test_futbol_v2");
  ({ query, closePool } = await import("../src/db.mjs"));
  ({ runFeed } = await import("../src/run-feed.mjs"));
  ({ ingestVideos } = await import("../src/feeds/videos.mjs"));
  ({ ingestNews } = await import("../src/feeds/news.mjs"));
  await query(`update video_channels set active = false`);
  await query(`update news_sources set active = false`);
  // Clubs of this test only: the seeded teams (if any) would change which stories have clubs to match.
  await query(`delete from teams where source <> 'v2-test'`);
  const lg = (c) => `(select id from leagues where country = '${c}' and active order by id limit 1)`;
  await query(`insert into teams (league_id, country, name, source, source_team_id) values
                 (${lg("MX")}, 'MX', 'Club America', 'v2-test', 'v2-1'), (${lg("MX")}, 'MX', 'Cruz Azul', 'v2-test', 'v2-2'),
                 (${lg("MX")}, 'MX', 'Guadalajara Chivas', 'v2-test', 'v2-3'), (${lg("HN")}, 'HN', 'CD Motagua', 'v2-test', 'v2-4')`);
  await query(`insert into video_channels (key, name, youtube_channel_id, country, league_id, club_key, kind, verified_at) values
                 ('v2-league', 'V2 League', $1, 'MX', ${lg("MX")}, null, 'league', '2026-09-15'),
                 ('v2-tv', 'V2 TV', $2, 'MX', null, null, 'broadcaster', '2026-09-15'),
                 ('v2-fmf', 'V2 FMF', $3, 'MX', null, null, 'national', '2026-09-15'),
                 ('v2-concacaf', 'V2 Concacaf', $4, null, null, null, 'confederation', '2026-09-15')`, [CH.league, CH.tv, CH.fmf, CH.conf]);
  await query(`insert into affiliates (id, name) values ('99990000-0000-4000-8000-0000000006a0', 'Futbol v2 Ingest Test')`);
  await query(
    `insert into clients (id, affiliate_id, code, full_name, country, language, timezone, team_id)
     select '${CLIENT}', '99990000-0000-4000-8000-0000000006a0', 'ZECTAQ26', 'V2 Person', 'MX', 'es', 'America/Toronto', id
       from teams where name = 'Club America' and source = 'v2-test'`);
});
after(async () => { if (!unavailable) await closePool(); });

const feedUrl = (ch) => `https://www.youtube.com/feeds/videos.xml?channel_id=${ch}`;
const mq = (id) => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
const hq = (id) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
const vid = (s) => `${s}___________`.slice(0, 11);
const hoursAgo = (h) => new Date(NOW.getTime() - h * 3600e3);
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const atom = (channelId, entries) => `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/" xmlns="http://www.w3.org/2005/Atom">
 <title>Channel</title><link rel="alternate" href="https://www.youtube.com/channel/${channelId}"/>
${entries.map((e) => ` <entry><yt:videoId>${e.id}</yt:videoId><title>${esc(e.title)}</title>
  <link rel="alternate" href="https://www.youtube.com/${e.short ? "shorts/" : "watch?v="}${e.id}"/><published>${e.date.toISOString()}</published>
  <media:group><media:thumbnail url="https://i2.ytimg.com/vi/${e.id}/hqdefault.jpg" width="480" height="360"/><media:community><media:statistics views="5"/></media:community></media:group></entry>`).join("\n")}
</feed>`;

function mockFetch(routes) {
  const calls = [];
  const f = async (url) => {
    const u = String(url);
    calls.push(u);
    const r = routes[u];
    if (r instanceof Error || r === undefined) throw new TypeError("fetch failed", { cause: { code: "ENOTFOUND" } });
    return new Response(r.body, { status: r.status ?? 200, headers: { "content-type": r.type ?? "text/xml; charset=UTF-8" } });
  };
  f.calls = calls;
  return f;
}
const jpg = (w, h) => ({ body: photoJpeg(w, h), type: "image/jpeg" });
const rows = async (sql, params) => (await query(sql, params)).rows;

test("videos: Shorts kept or skipped, /shorts/ urls and vertical thumbnails, categories, national teams, the confederation", { skip: unavailable ?? false }, async () => {
  const E = {
    A: { id: vid("v2A"), title: "CRUZ AZUL 4-3 AMÉRICA | Partidazo y la Máquina se queda con los 3 puntos | J8 AP26", date: hoursAgo(2) },
    S1: { id: vid("v2S1"), title: "#ElPasillo del @clubamerica 🆚 @CFCruzAzul check. ✅", date: hoursAgo(1), short: true },
    S2: { id: vid("v2S2"), title: "Erik Lira dio un partidazo en el Coloso de Santa Úrsula. 🤩 ¡qué golazo! ⚽️", date: hoursAgo(1.5), short: true },
    S3: { id: vid("v2S3"), title: "¡AÚN DUELE! 😫🔥 El gol de Reyes que echó a Chivas 🦅 #shorts", date: hoursAgo(3), short: true },
    S7: { id: vid("v2S7"), title: "¡Golazo de Lozano para Santos! #shorts", date: hoursAgo(3.5), short: true },
    S4: { id: vid("v2S4"), title: "Se viene el Clásico Nacional: 🇲🇽 América vs. Chivas 💥 #shorts", date: hoursAgo(4), short: true },
    S5: { id: vid("v2S5"), title: "Señora atajada de Jurado #shorts", date: hoursAgo(4.5), short: true },
    D: { id: vid("v2D"), title: "Javier Aguirre en conferencia de prensa | Selección Mexicana", date: hoursAgo(5) },
    E: { id: vid("v2E"), title: "México vs Panamá | Resumen | Nations League", date: hoursAgo(6) },
    F: { id: vid("v2F"), title: "EN VIVO | PRESENTACIÓN DE RAFAEL MÁRQUEZ COMO DT DE LA SELECCIÓN NACIONAL DE MÉXICO", date: hoursAgo(7) },
    G: { id: vid("v2G"), title: "Resumen | México Femenil vs Canadá", date: hoursAgo(8) },
    S6: { id: vid("v2S6"), title: "La #MáquinaDelTiempo nos lleva al primer gol de Armando González con la Selección", date: hoursAgo(9), short: true },
    H: { id: vid("v2H"), title: "Motagua toma ventaja en los Cuartos de Final | Extended Highlights | Copa Centroamericana", date: hoursAgo(10) },
    I: { id: vid("v2I"), title: "Resumen | Cruz Azul Femenil vs Pumas | Jornada 7 | Apertura 2026", date: hoursAgo(11) },
  };
  const routes = {
    [feedUrl(CH.league)]: { body: atom(CH.league, [E.A, E.S1, E.S2, E.I]) },
    [feedUrl(CH.tv)]: { body: atom(CH.tv, [E.S3, E.S7, E.S4, E.S5, E.D, E.E]) },
    [feedUrl(CH.fmf)]: { body: atom(CH.fmf, [E.F, E.G, E.S6]) },
    [feedUrl(CH.conf)]: { body: atom(CH.conf, [E.H]) },
  };
  for (const e of Object.values(E)) routes[e.short ? hq(e.id) : mq(e.id)] = e.short ? jpg(480, 360) : jpg(320, 180);
  const fetchImpl = mockFetch(routes);
  const r = await runFeed("videos", (ctx) => ingestVideos(ctx, { fetchImpl, now: NOW }));
  assert.equal(r.status, "ok");

  const stored = await rows(`select youtube_id, url, is_short, category, is_highlight, thumb_w, thumb_h, octet_length(thumb) b, classified_at is not null classified from videos`);
  const by = Object.fromEntries(stored.map((x) => [x.youtube_id, x]));
  const kept = Object.entries(E).filter(([, e]) => by[e.id]).map(([k]) => k).sort();
  assert.deepEqual(kept, ["A", "D", "E", "F", "G", "H", "I", "S2", "S3", "S4", "S6"],
    "S1 tunnel (other), S7 goals naming no club of ours from a broadcaster (Santos is guarded and not ours), S5 a save (other) are skipped; S2 goals of the league's channel, S3 goals naming Chivas, S4 a preview naming two clubs, S6 goals of the federation are kept");
  assert.ok(!fetchImpl.calls.some((u) => [E.S1, E.S7, E.S5].some((e) => u.includes(e.id))), "no thumbnail fetched for a skipped Short");

  assert.deepEqual([by[E.S4.id].url, by[E.S4.id].is_short, by[E.S4.id].thumb_w, by[E.S4.id].thumb_h], [`https://www.youtube.com/shorts/${E.S4.id}`, true, 180, 320]);
  assert.deepEqual([by[E.A.id].url, by[E.A.id].is_short, by[E.A.id].thumb_w, by[E.A.id].thumb_h], [`https://www.youtube.com/watch?v=${E.A.id}`, false, 320, 180]);
  assert.ok(stored.every((x) => x.b <= 14_000 && x.classified), JSON.stringify(stored.map((x) => x.b)));
  assert.ok(fetchImpl.calls.includes(hq(E.S4.id)) && !fetchImpl.calls.includes(mq(E.S4.id)), "a Short's thumbnail comes from hqdefault.jpg");

  const cat = Object.fromEntries(Object.entries(E).filter(([, e]) => by[e.id]).map(([k, e]) => [k, `${by[e.id].category}${by[e.id].is_highlight ? "+H" : ""}`]));
  assert.deepEqual(cat, { A: "highlight+H", D: "interview", E: "highlight+H", F: "other", G: "highlight+H", H: "highlight+H", I: "other", S2: "goals+H", S3: "goals+H", S4: "preview", S6: "goals+H" },
    "I is the women's side: never a highlight of the men's league");

  const vt = (await rows(`select v.youtube_id, t.name, vt.rule from video_teams vt join videos v on v.id = vt.video_id join teams t on t.id = vt.team_id order by 1, 2`))
    .map((x) => `${Object.keys(E).find((k) => E[k].id === x.youtube_id)}:${x.name}:${x.rule}`);
  assert.deepEqual(vt.sort(), ["A:Club America:name+match", "A:Cruz Azul:name", "H:CD Motagua:name", "S3:Guadalajara Chivas:name", "S4:Club America:name+match", "S4:Guadalajara Chivas:name"].sort(),
    "the confederation's video names Honduras's club");
  const vn = (await rows(`select v.youtube_id, n.country::text, n.women, n.rule from video_nations n join videos v on v.id = n.video_id`))
    .map((x) => `${Object.keys(E).find((k) => E[k].id === x.youtube_id)}:${x.country}:${x.women ? "women" : "men"}:${x.rule}`).sort();
  // One row per video and team: on the federation's channel its rule is national_channel.
  assert.deepEqual(vn, ["D:MX:men:alias", "E:MX:men:name+match", "F:MX:men:national_channel", "G:MX:women:national_channel", "S6:MX:men:national_channel"].sort());

  const page = (await query(`select app.football_videos($1) p`, [CLIENT])).rows[0].p;
  const ids = (list) => list.map((v) => Object.keys(E).find((k) => E[k].id === v.youtube_id));
  assert.deepEqual(ids(page.team_videos), ["A"]);
  assert.deepEqual(ids(page.shorts), ["S4", "S2", "S3", "S6"], "their team's Short, the league's (its channel's, one naming a club of the league), the national team's");
  assert.deepEqual(ids(page.national), ["E", "D", "F"]);
  assert.deepEqual(ids(page.national_women), ["G"]);
  assert.equal(page.shorts[0].url, `https://www.youtube.com/shorts/${E.S4.id}`);
});

test("videos stored before categories are classified and matched to national teams on a later run", { skip: unavailable ?? false }, async () => {
  await query(
    `insert into videos (channel_id, youtube_id, url, title, published_at, is_highlight)
     select id, x.yid, 'https://www.youtube.com/watch?v=' || x.yid, x.title, now() - interval '2 days', x.h
       from video_channels, (values ('old49goals1', 'Top 5 Goles de la Jornada 7 - Liga Nacional de Honduras - Apertura 2026-2027', true),
                                    ('old49selmx1', 'Selección Mexicana vs Panamá: la previa del partido', false)) x(yid, title, h)
      where key = 'v2-tv'`);
  const before = await rows(`select youtube_id, category from videos where youtube_id like 'old49%' order by 1`);
  assert.deepEqual(before.map((x) => x.category), ["highlight", "other"], "0049 rows get a category from is_highlight");
  const routes = Object.fromEntries(Object.values(CH).map((c) => [feedUrl(c), { body: atom(c, []) }]));
  await runFeed("videos", (ctx) => ingestVideos(ctx, { fetchImpl: mockFetch(routes), now: NOW }));
  const after = await rows(`select youtube_id, category, is_highlight, classified_at is not null c from videos where youtube_id like 'old49%' order by 1`);
  assert.deepEqual(after.map((x) => [x.youtube_id, x.category, x.is_highlight, x.c]), [["old49goals1", "goals", true, true], ["old49selmx1", "preview", false, true]]);
  const vn = await rows(`select n.country::text, n.women, n.rule from video_nations n join videos v on v.id = n.video_id where v.youtube_id = 'old49selmx1'`);
  assert.deepEqual(vn, [{ country: "MX", women: false, rule: "alias" }]);
});

const rss = (items) => `<?xml version="1.0"?><rss version="2.0"><channel><title>t</title>${items.map((i) =>
  `<item><title><![CDATA[${i.title}]]></title><link>${i.link}</link><guid isPermaLink="false">${i.guid}</guid><pubDate>${i.date.toUTCString()}</pubDate><description><![CDATA[${i.desc ?? ""}]]></description></item>`).join("")}</channel></rss>`;

test("news: stories matched to clubs at ingest, stored stories backfilled, a country without clubs left unchecked; team_news", { skip: unavailable ?? false }, async () => {
  await query(`insert into news_sources (key, name, country, admin_region, homepage_url, feed_url, language, verified_at) values
                 ('v2-news-mx', 'V2 MX', 'MX', null, 'https://v2mx.example/', 'https://v2mx.example/feed', 'es', '2026-09-15'),
                 ('v2-news-gt', 'V2 GT', 'GT', null, 'https://v2gt.example/', 'https://v2gt.example/feed', 'es', '2026-09-15')`);
  // Stored before club matching (0047/0048): teams_checked_at is null.
  await query(`insert into news_items (source_id, guid, url, url_key, title, summary, published_at)
               select id, 'stored-1', 'https://v2mx.example/stored-1', 'v2mx.example/stored-1',
                      'Emilio Azcárraga reacciona a la derrota del América ante Cruz Azul; "Se salvaron"',
                      'Hace unas horas, Cruz Azul y América protagonizaron uno de los partidos más emocionantes del Apertura 2026 en la cancha del Estadio Banorte.',
                      now() - interval '1 day'
                 from news_sources where key = 'v2-news-mx'`);
  const routes = {
    "https://v2mx.example/feed": { body: rss([
      { title: "Chivas expulsa a dos aficionados del Estadio Akron por gritos discriminatorios", link: "https://v2mx.example/chivas", guid: "n-1", date: hoursAgo(2) },
      { title: "Claudia Sheinbaum recibe a Los Tigres del Norte en Palacio Nacional", link: "https://v2mx.example/tigres", guid: "n-2", date: hoursAgo(3) },
      { title: "Asesinan a aficionado del América tras el partido ante Cruz Azul", link: "https://v2mx.example/grafica", guid: "n-3", date: hoursAgo(1) },
      { title: "América presenta a su refuerzo para el Clásico: el nuevo delantero", link: "https://v2mx.example/refuerzo", guid: "n-4", date: hoursAgo(4) },
    ]) },
    "https://v2gt.example/feed": { body: rss([
      { title: "Municipal empata con Malacateco y podría perder el liderato", link: "https://v2gt.example/muni", guid: "g-1", date: hoursAgo(2), desc: "Municipal del técnico Mario Acevedo recibió a Deportivo Malacateco en la fecha 9 del Torneo Apertura 2026." },
    ]) },
  };
  const r = await runFeed("news", (ctx) => ingestNews(ctx, { fetchImpl: mockFetch(routes), now: NOW, imageCap: 0, pageCap: 0 }));
  assert.equal(r.status, "ok");

  const nt = (await rows(`select i.guid, t.name, nt.rule, nt.matched from news_teams nt join news_items i on i.id = nt.item_id join teams t on t.id = nt.team_id`))
    .map((x) => `${x.guid}:${x.name}:${x.rule}:${x.matched}`).sort();
  assert.deepEqual(nt, [
    "n-1:Guadalajara Chivas:alias+context:Chivas",
    "n-3:Club America:name+article:América", "n-3:Cruz Azul:alias+context:Cruz Azul",
    "stored-1:Club America:name+article:América", "stored-1:Cruz Azul:alias+context:Cruz Azul",
  ].sort(), "n-2: Los Tigres del Norte are a band; n-4: a guarded name opening a headline, with no el/del/al and no match line, is not enough (less, with confidence)");
  const checked = Object.fromEntries((await rows(`select guid, teams_checked_at is not null c from news_items`)).map((x) => [x.guid, x.c]));
  assert.deepEqual(checked, { "stored-1": true, "n-1": true, "n-2": true, "n-3": true, "n-4": true, "g-1": false },
    "Guatemala has no clubs in this database: its story is left unchecked, not \"about no club\"");

  const tn = (await query(`select app.team_news($1) p`, [CLIENT])).rows[0].p;
  const titles = tn.items.map((i) => i.title);
  assert.notEqual(titles[0], "Asesinan a aficionado del América tras el partido ante Cruz Azul", "a graphic story never leads");
  assert.ok(titles.includes("Asesinan a aficionado del América tras el partido ante Cruz Azul") && titles.includes('Emilio Azcárraga reacciona a la derrota del América ante Cruz Azul; "Se salvaron"'), JSON.stringify(titles));
  assert.equal(tn.items.find((i) => i.title.startsWith("Asesinan")).image, false);
  const fp = (await query(`select app.football_page($1) p`, [CLIENT])).rows[0].p;
  assert.ok(fp.team_news.items.length <= 4 && fp.team_news.items.length >= 1 && fp.team_news.stale === false, JSON.stringify(fp.team_news));
});
