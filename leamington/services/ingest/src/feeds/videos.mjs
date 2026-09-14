/**
 * Football videos: the latest uploads of verified official YouTube channels
 * (video_channels, 0049), hourly. Stance: docs/OPEN-DECISIONS.md 3.25.
 *
 * Per run:
 *   1. Read every active channel's public upload feed (Atom, no API key; the
 *      latest 15 uploads) with a timeout and a size cap. A channel that does not
 *      answer, or answers with something that is not its feed, is a warning (the
 *      run is partial); if no channel answers the run fails, recorded as an
 *      error: never "no videos".
 *   2. Keep uploads (not Shorts) published within 60 days. Store the title, the
 *      channel, the time, the video id, the views, and whether the title says it
 *      is a highlight (videos/highlight.mjs). Known videos get their view count
 *      refreshed.
 *   3. A thumbnail from YouTube's own CDN only (i.ytimg.com: mqdefault.jpg,
 *      else the feed's media:thumbnail), re-encoded to a JPEG of at most 14 KB,
 *      320 px wide (videos/thumb.mjs), at most THUMB_CAP per run, shared out
 *      across channels. A video whose thumbnail fails is stored without one.
 *      Never hotlinked. Videos stored while the budget was spent get theirs on a
 *      later run.
 *   4. The teams each video is about (videos/teams.mjs), from teams of the
 *      channel's country, with stored fixtures to confirm guarded names. A club
 *      channel's team is resolved from its club_key.
 *   5. Prune videos older than 60 days.
 *
 * `store: dryStore(dir, …)` fetches everything and writes nothing to the
 * database: thumbnails are saved there as files (scripts/fetch-videos.mjs).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { query } from "../db.mjs";
import { fetchCapped, budget, interleave, mapLimit } from "./news.mjs";
import { parseYouTubeFeed, feedUrl, mqThumbUrl, ytimgUrl } from "./videos/youtube.mjs";
import { classifyTitle } from "./videos/highlight.mjs";
import { makeThumb, THUMB } from "./videos/thumb.mjs";
import { buildTeamIndex, clubTeam, matchTeams } from "./videos/teams.mjs";

export const THUMB_CAP = 60;        // thumbnails made per run
export const MAX_AGE_DAYS = 60;
const FEED_MAX_BYTES = 1_000_000;   // a channel feed is ~25 KB
const FEED_TIMEOUT_MS = 15_000;
const THUMB_TIMEOUT_MS = 10_000;
const FEED_CONCURRENCY = 4;

/** Download a thumbnail from i.ytimg.com and make the JPEG. Throws with the reason. */
export async function fetchThumb(url, { fetchImpl }) {
  if (!ytimgUrl(url)) throw new Error(`not YouTube's thumbnail host: ${String(url).slice(0, 60)}`);
  const r = await fetchCapped(url, { fetchImpl, timeoutMs: THUMB_TIMEOUT_MS, maxBytes: THUMB.downloadMaxBytes, accept: "image/jpeg" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  if (r.url && !ytimgUrl(r.url)) throw new Error("redirected off i.ytimg.com");
  return makeThumb(r.bytes);
}

/** The database side of a run. */
export function dbStore() {
  return {
    async channels() {
      return (await query(
        `select id, key, name, youtube_channel_id, country::text, league_id, team_id, club_key, kind
           from video_channels where active order by country, id`)).rows;
    },
    async teams() {
      return (await query(`select id, league_id, country::text, name, short_name from teams`)).rows;
    },
    async fixtures(now) {
      return (await query(
        `select home_team_id, away_team_id, kickoff_utc as kickoff from fixtures
          where kickoff_utc between $1::timestamptz - interval '62 days' and $1::timestamptz + interval '2 days'`, [now])).rows;
    },
    async setChannelTeam(channelId, teamId) {
      await query(`update video_channels set team_id = $2 where id = $1 and team_id is distinct from $2`, [channelId, teamId]);
    },
    async known(youtubeIds) {
      const { rows } = await query(`select id, youtube_id, thumb_checked_at is null as unchecked from videos where youtube_id = any($1::text[])`, [youtubeIds]);
      return new Map(rows.map((r) => [r.youtube_id, { id: r.id, unchecked: r.unchecked }]));
    },
    async refreshViews(pairs) {
      if (!pairs.length) return;
      await query(
        `update videos v set views = x.views from unnest($1::text[], $2::bigint[]) as x(youtube_id, views)
          where v.youtube_id = x.youtube_id and x.views is not null`,
        [pairs.map((p) => p.youtubeId), pairs.map((p) => p.views)]);
    },
    async saveVideo(channel, v, thumb, checked) {
      const { rows } = await query(
        `insert into videos (channel_id, youtube_id, url, title, published_at, views, is_highlight, thumb, thumb_w, thumb_h, thumb_checked_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, case when $11::boolean then now() end)
         on conflict (youtube_id) do nothing returning id`,
        [channel.id, v.youtubeId, v.url, v.title, v.publishedAt, v.views, v.isHighlight,
          thumb?.bytes ?? null, thumb?.width ?? null, thumb?.height ?? null, Boolean(checked)]);
      return rows[0]?.id ?? null;
    },
    async setThumb(videoId, thumb) {
      await query(
        `update videos set thumb = coalesce($2, thumb), thumb_w = coalesce($3, thumb_w), thumb_h = coalesce($4, thumb_h), thumb_checked_at = now() where id = $1`,
        [videoId, thumb?.bytes ?? null, thumb?.width ?? null, thumb?.height ?? null]);
    },
    async saveTeams(videoId, matches) {
      for (const m of matches) {
        await query(`insert into video_teams (video_id, team_id, matched, rule) values ($1, $2, $3, $4) on conflict do nothing`,
          [videoId, m.teamId, m.matched.slice(0, 120), m.rule]);
      }
    },
    async prune(now) {
      return (await query(`select app.prune_videos($1) as r`, [now])).rows[0].r;
    },
  };
}

const safe = (s) => String(s).replace(/[^\p{L}\p{N}]+/gu, "_").slice(0, 50);

/** A store that writes nothing to the database: thumbnails go to `dir`. Channels, teams and fixtures are given. */
export function dryStore(dir, { channels, teams, fixtures = [] }) {
  mkdirSync(dir, { recursive: true });
  let seq = 0;
  return {
    channels: async () => channels,
    teams: async () => teams,
    fixtures: async () => fixtures,
    setChannelTeam: async () => {},
    known: async () => new Map(),
    refreshViews: async () => {},
    async saveVideo(channel, v, thumb) {
      const id = ++seq;
      if (thumb) writeFileSync(`${dir}/${safe(channel.key)}-${v.youtubeId}.jpg`, thumb.bytes);
      return id;
    },
    setThumb: async () => {},
    saveTeams: async () => {},
    prune: async () => null,
  };
}

/**
 * The feed. Options: fetchImpl (tests), now, thumbCap, store (dryStore for a
 * dry run). Returns { recordsWritten, sourceResult, stats, matches }.
 */
export async function ingestVideos(ctx, { fetchImpl = globalThis.fetch, now = new Date(), thumbCap = THUMB_CAP, store = dbStore() } = {}) {
  const log = ctx.log ?? { info() {}, warn() {} };
  const warnings = ctx.warnings ?? (ctx.warnings = []);
  const channels = await store.channels();
  if (!channels.length) {
    warnings.push("no active video channels; nothing was fetched");
    return { recordsWritten: 0, stats: [], matches: [] };
  }
  const index = buildTeamIndex(await store.teams());
  const fixtures = await store.fixtures(now);
  const oldest = now.getTime() - MAX_AGE_DAYS * 864e5;
  const newest = now.getTime() + 3600e3;

  // Club channels: their team, once the fixtures feed has created it.
  for (const c of channels) {
    const t = clubTeam(index, c);
    if (t && c.team_id !== t.id) { await store.setChannelTeam(c.id, t.id); c.team_id = t.id; }
  }

  const stats = new Map(channels.map((c) => [c.key, { key: c.key, name: c.name, country: c.country, kind: c.kind, entries: 0, shorts: 0, inWindow: 0, stored: 0, highlights: 0, withThumb: 0, thumbFailures: 0, thumbBytes: [], error: null, failures: [] }]));

  // 1. Every feed, a few at a time.
  const fetched = await mapLimit(channels, FEED_CONCURRENCY, async (c) => {
    const st = stats.get(c.key);
    try {
      const r = await fetchCapped(feedUrl(c.youtube_channel_id), { fetchImpl, timeoutMs: FEED_TIMEOUT_MS, maxBytes: FEED_MAX_BYTES, accept: "application/atom+xml, application/xml;q=0.9, text/xml;q=0.9" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const parsed = parseYouTubeFeed(r.bytes.toString("utf8"));
      // The feed of another channel (a moved or reused id) is not this channel's.
      if (parsed.channelId && parsed.channelId !== c.youtube_channel_id) throw new Error(`feed is channel ${parsed.channelId}, not ${c.youtube_channel_id}`);
      st.entries = parsed.entries.length;
      st.shorts = parsed.entries.filter((e) => e.isShort).length;
      if (parsed.entries.length === 0 && parsed.dropped > 0) warnings.push(`${c.key}: every upload lacked an id, title or date`);
      const items = parsed.entries
        .filter((e) => !e.isShort && e.publishedAt.getTime() >= oldest && e.publishedAt.getTime() <= newest)
        .sort((a, b) => b.publishedAt - a.publishedAt);
      st.inWindow = items.length;
      return { channel: c, items };
    } catch (err) {
      st.error = err.message;
      warnings.push(`${c.key}: ${err.message}`);
      log.warn("videos.channel_failed", { channel: c.key, error: err.message });
      return null;
    }
  });

  const answered = fetched.filter(Boolean);
  if (!answered.length) {
    // Not "no videos": nobody answered. runFeed records this run as an error.
    const e = new Error(`no video channel answered (${channels.length} tried): ${[...stats.values()].map((s) => `${s.key}: ${s.error}`).join("; ").slice(0, 900)}`);
    e.detail = e.message;
    throw e;
  }

  // 2. New videos, and fresh view counts for known ones.
  const perChannel = [];
  const backfill = [];
  for (const { channel, items } of answered) {
    const known = items.length ? await store.known(items.map((i) => i.youtubeId)) : new Map();
    await store.refreshViews(items.filter((i) => known.has(i.youtubeId)));
    perChannel.push(items.filter((i) => !known.has(i.youtubeId)).map((it) => ({ channel, it })));
    backfill.push(items.filter((i) => known.get(i.youtubeId)?.unchecked).map((it) => ({ channel, it, videoId: known.get(it.youtubeId).id })));
  }

  // 3-4. Thumbnails (budgeted, shared out across channels), videos, teams.
  const thumbs = budget(thumbCap);
  const matchesFound = [];
  let written = 0;

  /** { thumb, checked }: checked is false only when the budget stopped the look. */
  async function thumbFor(it, st) {
    if (!thumbs.take()) return { thumb: null, checked: false };
    const urls = [...new Set([mqThumbUrl(it.youtubeId), it.thumbUrl].filter(Boolean))];
    for (const url of urls) {
      try {
        const thumb = await fetchThumb(url, { fetchImpl });
        st.thumbBytes.push(thumb.bytes.length);
        return { thumb, checked: true };
      } catch (err) {
        st.failures.push(`${url.slice(0, 70)}: ${err.message}`);
      }
    }
    st.thumbFailures++;
    return { thumb: null, checked: true };
  }

  for (const { channel, it } of interleave(perChannel)) {
    const st = stats.get(channel.key);
    try {
      const cls = classifyTitle(it.title);
      it.isHighlight = cls.highlight;
      const { thumb, checked } = await thumbFor(it, st);
      const videoId = await store.saveVideo(channel, it, thumb, checked);
      if (!videoId) continue;
      written++;
      st.stored++;
      if (it.isHighlight) st.highlights++;
      if (thumb) st.withThumb++;
      const matches = matchTeams(it, channel, index, { fixtures });
      if (matches.length) {
        await store.saveTeams(videoId, matches);
        for (const m of matches) matchesFound.push({ ...m, channel: channel.key, title: it.title, highlight: it.isHighlight, why: cls.why });
      }
    } catch (err) {
      warnings.push(`${channel.key}: video not stored (${err.message.slice(0, 120)})`);
    }
  }

  // Thumbnails for videos an earlier run stored without looking, newest first, with what budget is left.
  let backfilled = 0;
  for (const { channel, it, videoId } of interleave(backfill)) {
    if (thumbs.used >= thumbs.cap) break;
    try {
      const { thumb, checked } = await thumbFor(it, stats.get(channel.key));
      if (!checked) continue;
      await store.setThumb(videoId, thumb);
      if (thumb) backfilled++;
    } catch (err) {
      warnings.push(`${channel.key}: thumbnail not stored (${err.message.slice(0, 120)})`);
    }
  }

  // 5. Prune.
  const pruned = await store.prune(now);

  const list = [...stats.values()];
  log.info("videos", {
    channels: channels.length, answered: answered.length, stored: written, backfilled, thumbs: thumbs.used,
    thumbFailures: list.reduce((n, s) => n + s.thumbFailures, 0), matches: matchesFound.length, pruned,
  });
  return { recordsWritten: written, sourceResult: "items", stats: list, matches: matchesFound, thumbsUsed: thumbs.used };
}
