/**
 * The videos feed against a throwaway local Postgres (helpers/local-db.mjs),
 * with fetch mocked: stored videos (Shorts and old uploads skipped),
 * thumbnails from i.ytimg.com only (mqdefault, then the feed's own), team
 * matches, a club channel's team, refreshed views; the per-run thumbnail cap
 * and the backfill; a failing channel makes the run partial, every channel
 * failing makes it an error; pruning. Skipped when no local Postgres is running.
 *   TEST_PGPORT=55433 node --test test/videos-ingest.test.mjs
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

import { localDbUnavailable, useFreshDatabase } from "./helpers/local-db.mjs";
import { photoJpeg } from "./helpers/news-images.mjs";

const unavailable = localDbUnavailable();
const NOW = new Date();
let query, closePool, runFeed, ingestVideos;

const CH = {
  league: "UCtestleague0000000000aa",
  tv: "UCtesttv0000000000000aaa",
  club: "UCtestclub00000000000aaa",
  dead: "UCtestdead00000000000aaa",
};
const CLIENT = "99990000-0000-4000-8000-0000000005a1";

before(async () => {
  if (unavailable) return;
  useFreshDatabase("leamington_ingest_test_videos");
  ({ query, closePool } = await import("../src/db.mjs"));
  ({ runFeed } = await import("../src/run-feed.mjs"));
  ({ ingestVideos } = await import("../src/feeds/videos.mjs"));
  await query(`update video_channels set active = false`);   // the seeded channels are never fetched in tests
  const mx = `(select id from leagues where country = 'MX' and active order by id limit 1)`;
  await query(`insert into teams (league_id, country, name, source, source_team_id) values
                 (${mx}, 'MX', 'Club America', 'test', 'vi-1'), (${mx}, 'MX', 'Cruz Azul', 'test', 'vi-2')`);
  await query(`insert into video_channels (key, name, youtube_channel_id, country, league_id, club_key, kind, verified_at) values
                 ('t-league', 'Test League', $1, 'MX', ${mx}, null, 'league', '2026-09-14'),
                 ('t-tv', 'Test TV', $2, 'MX', null, null, 'broadcaster', '2026-09-14'),
                 ('t-club', 'Test Club', $3, 'MX', null, 'mx-america', 'club', '2026-09-14'),
                 ('t-dead', 'Test Dead', $4, 'JM', null, null, 'broadcaster', '2026-09-14')`, [CH.league, CH.tv, CH.club, CH.dead]);
  await query(`insert into affiliates (id, name) values ('99990000-0000-4000-8000-0000000005a0', 'Videos Ingest Test')`);
  await query(
    `insert into clients (id, affiliate_id, code, full_name, country, language, timezone, team_id)
     select '${CLIENT}', '99990000-0000-4000-8000-0000000005a0', 'ZECTAQ62', 'Videos Person', 'MX', 'es', 'America/Toronto', id
       from teams where name = 'Club America' and source = 'test'`);
});
after(async () => { if (!unavailable) await closePool(); });

const feed = (ch) => `https://www.youtube.com/feeds/videos.xml?channel_id=${ch}`;
const mq = (id) => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
const hq = (id) => `https://i1.ytimg.com/vi/${id}/hqdefault.jpg`;
const vid = (s) => `${s}___________`.slice(0, 11);
const hoursAgo = (h) => new Date(NOW.getTime() - h * 3600e3);
/** A channel's Atom feed, shaped like YouTube's (see test/fixtures/videos). */
const atom = (channelId, entries) => `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/" xmlns="http://www.w3.org/2005/Atom">
 <link rel="self" href="http://www.youtube.com/feeds/videos.xml?channel_id=${channelId}"/><id>yt:channel:${channelId.slice(2)}</id>
 <title>Channel</title><link rel="alternate" href="https://www.youtube.com/channel/${channelId}"/>
${entries.map((e) => ` <entry><id>yt:video:${e.id}</id><yt:videoId>${e.id}</yt:videoId><yt:channelId>${channelId}</yt:channelId><title>${e.title}</title>
  <link rel="alternate" href="https://www.youtube.com/${e.short ? "shorts/" : "watch?v="}${e.id}"/><published>${e.date.toISOString()}</published>
  <media:group><media:thumbnail url="${e.thumb ?? hq(e.id)}" width="480" height="360"/><media:community><media:statistics views="${e.views ?? 10}"/></media:community></media:group></entry>`).join("\n")}
</feed>`;

function mockFetch(routes) {
  const calls = [];
  const f = async (url) => {
    const u = String(url);
    calls.push(u);
    const r = routes[u];
    if (r instanceof Error || r === undefined) throw new TypeError("fetch failed", { cause: { code: r ? "ECONNRESET" : "ENOTFOUND" } });
    return new Response(r.body, { status: r.status ?? 200, headers: { "content-type": r.type ?? "text/xml; charset=UTF-8" } });
  };
  f.calls = calls;
  return f;
}
const jpg = (w, h) => ({ body: photoJpeg(w, h), type: "image/jpeg" });
const xml = (body) => ({ body });
const count = async (sql, params) => Number((await query(sql, params)).rows[0].n);
const thumbCalls = (f) => f.calls.filter((u) => /ytimg\.com|evil\.example/.test(u));

test("a run: uploads not Shorts, thumbnails from i.ytimg.com only, team matches, the club's team; a dead channel is partial", { skip: unavailable ?? false }, async () => {
  const A = vid("A"), B = vid("B"), C = vid("C"), D = vid("D"), E = vid("E"), F = vid("F");
  const routes = {
    [feed(CH.league)]: xml(atom(CH.league, [
      { id: A, title: "CRUZ AZUL 4-3 AMÉRICA | Partidazo y la Máquina se queda con los 3 puntos | J8 AP26", date: hoursAgo(2), views: 699516 },
      { id: B, title: "#ElPasillo del @clubamerica 🆚 @CFCruzAzul check. ✅", date: hoursAgo(1), short: true },
      { id: C, title: "CRUZ AZUL 1-0 AMÉRICA | Hace 61 días", date: hoursAgo(61 * 24) },
    ])),
    [feed(CH.tv)]: xml(atom(CH.tv, [
      { id: D, title: "RESUMEN Y GOLES - Cruz Azul vs América | Liga MX - Jornada 8 Apertura 2026 | TUDN", date: hoursAgo(3) },
      { id: E, title: "Torino 0-2 Roma | Serie A | Resumen", date: hoursAgo(4), thumb: `https://evil.example/vi/${E}/hqdefault.jpg` },
    ])),
    [feed(CH.club)]: xml(atom(CH.club, [
      { id: F, title: "Presentación de Refuerzos - Santiago Baños y Antonio Ibrahim", date: hoursAgo(5) },
    ])),
    [feed(CH.dead)]: new Error("dead"),
    [mq(A)]: jpg(320, 180),
    [mq(D)]: { body: "", status: 404, type: "text/html" },
    [hq(D)]: jpg(480, 360),
    [mq(E)]: { body: "<html>no</html>", type: "text/html" },
    [mq(F)]: jpg(320, 180),
  };
  const fetchImpl = mockFetch(routes);
  const r = await runFeed("videos", (ctx) => ingestVideos(ctx, { fetchImpl, now: NOW }));
  assert.equal(r.status, "partial");
  assert.equal(r.recordsWritten, 4, "A, D, E, F (B is a Short, C is 61 days old)");
  const run = (await query(`select notes from source_runs where feed = 'videos' order by id desc limit 1`)).rows[0];
  assert.match(JSON.stringify(run.notes), /t-dead: (ENOTFOUND|ECONNRESET)/);

  assert.deepEqual(thumbCalls(fetchImpl).sort(), [hq(D), mq(A), mq(D), mq(E), mq(F)].sort(), "YouTube's CDN only: never the feed's other host, never a Short's");
  const rows = (await query(`select youtube_id, url, views, is_highlight, octet_length(thumb) b, thumb_w, thumb_h, thumb_checked_at is not null checked from videos order by published_at desc`)).rows;
  assert.deepEqual(rows.map((x) => [x.youtube_id, x.is_highlight, x.thumb_w, x.thumb_h, x.checked]), [
    [A, true, 320, 180, true], [D, true, 320, 180, true], [E, true, null, null, true], [F, false, 320, 180, true]]);
  assert.equal(rows[0].url, `https://www.youtube.com/watch?v=${A}`);
  assert.equal(Number(rows[0].views), 699516);
  assert.ok(rows.every((x) => x.b == null || x.b <= 14_000), JSON.stringify(rows.map((x) => x.b)));

  const vt = (await query(`select v.youtube_id, t.name, vt.matched, vt.rule from video_teams vt join videos v on v.id = vt.video_id join teams t on t.id = vt.team_id order by v.youtube_id, t.name`)).rows;
  assert.deepEqual(vt.map((x) => `${x.youtube_id}:${x.name}:${x.rule}:${x.matched}`), [
    `${A}:Club America:name+match:América`, `${A}:Cruz Azul:name:Cruz Azul`,
    `${D}:Club America:name+match:América`, `${D}:Cruz Azul:name:Cruz Azul`,
    `${F}:Club America:club_channel:Test Club`]);
  assert.equal(await count(`select count(*) n from video_channels c join teams t on t.id = c.team_id where c.key = 't-club' and t.name = 'Club America'`), 1, "the club channel's team, from its club_key");

  const page = (await query(`select app.football_videos($1) p`, [CLIENT])).rows[0].p;
  assert.deepEqual(page.team_videos.map((v) => v.youtube_id), [A, D, F]);
  assert.equal(page.league_videos.length, 0, "the league's only highlight is already in team");
  assert.equal(page.stale, false);

  // The same feeds again: nothing new, no thumbnail fetched again, views refreshed.
  routes[feed(CH.league)] = xml(atom(CH.league, [{ id: A, title: "CRUZ AZUL 4-3 AMÉRICA | Partidazo y la Máquina se queda con los 3 puntos | J8 AP26", date: hoursAgo(2), views: 700001 }]));
  const again = mockFetch(routes);
  const r2 = await runFeed("videos", (ctx) => ingestVideos(ctx, { fetchImpl: again, now: NOW }));
  assert.equal(r2.recordsWritten, 0);
  assert.deepEqual(thumbCalls(again), []);
  assert.equal(await count(`select views n from videos where youtube_id = $1`, [A]), 700001);
});

test("the thumbnail cap per run, and the backfill on the next run", { skip: unavailable ?? false }, async () => {
  await query(`delete from videos`);
  const ids = [1, 2, 3, 4, 5].map((i) => vid(`cap${i}`));
  const routes = {
    [feed(CH.league)]: xml(atom(CH.league, [])),
    [feed(CH.tv)]: xml(atom(CH.tv, ids.map((id, i) => ({ id, title: `Resumen ${i}`, date: hoursAgo(i + 1) })))),
    [feed(CH.club)]: xml(atom(CH.club, [])),
    [feed(CH.dead)]: xml(atom(CH.dead, [])),
  };
  for (const id of ids) routes[mq(id)] = jpg(320, 180);
  const fetchImpl = mockFetch(routes);
  const r = await runFeed("videos", (ctx) => ingestVideos(ctx, { fetchImpl, now: NOW, thumbCap: 2 }));
  assert.equal(r.status, "ok", "empty channels are not failures");
  assert.equal(r.recordsWritten, 5, "every video is stored, with or without a thumbnail");
  assert.deepEqual(thumbCalls(fetchImpl), [mq(ids[0]), mq(ids[1])], "newest first, two per run");
  assert.equal(await count(`select count(*) n from videos where thumb_checked_at is null`), 3);

  const next = mockFetch(routes);
  await runFeed("videos", (ctx) => ingestVideos(ctx, { fetchImpl: next, now: NOW, thumbCap: 10 }));
  assert.deepEqual(thumbCalls(next).sort(), [mq(ids[2]), mq(ids[3]), mq(ids[4])].sort());
  assert.equal(await count(`select count(*) n from videos where thumb is not null`), 5);
});

test("every channel failing is an error (inconclusive), never an empty videos run; another channel's feed is refused; pruning", { skip: unavailable ?? false }, async () => {
  const fetchImpl = mockFetch({
    [feed(CH.league)]: { body: "<!doctype html><html>Before you continue to YouTube</html>", type: "text/html" },
    [feed(CH.tv)]: { body: "Forbidden", status: 403, type: "text/html" },
    [feed(CH.club)]: xml(atom(CH.tv, [])),
  });
  const r = await runFeed("videos", (ctx) => ingestVideos(ctx, { fetchImpl, now: NOW }));
  assert.equal(r.status, "error");
  assert.equal(r.sourceResult, "no_answer");
  const run = (await query(`select error from source_runs where feed = 'videos' order by id desc limit 1`)).rows[0];
  for (const re of [/^no video channel answered \(4 tried\)/, /t-league: not a feed \(an HTML page\)/, /t-tv: HTTP 403/, /t-club: feed is channel UCtesttv\w+, not UCtestclub/, /t-dead: ENOTFOUND/]) {
    assert.match(run.error, re);
  }

  await query(
    `insert into videos (channel_id, youtube_id, url, title, published_at, is_highlight)
     select id, 'old________', 'https://www.youtube.com/watch?v=old________', 'Old', $1::timestamptz - interval '61 days', true from video_channels where key = 't-tv'`, [NOW]);
  const before = await count(`select count(*) n from videos`);
  const ok = await runFeed("videos", (ctx) => ingestVideos(ctx, { fetchImpl: mockFetch({ [feed(CH.tv)]: xml(atom(CH.tv, [])) }), now: NOW }));
  assert.equal(ok.status, "partial");
  assert.equal(await count(`select count(*) n from videos where youtube_id = 'old________'`), 0);
  assert.equal(await count(`select count(*) n from videos`), before - 1);
});
