/**
 * A YouTube channel's public upload feed:
 *   https://www.youtube.com/feeds/videos.xml?channel_id=UC…
 * Atom, no API key, the channel's latest 15 uploads. Parsed with the news
 * feed's tolerant element scanner (news/parse.mjs), not a second XML reader.
 *
 * Each entry becomes { youtubeId, url, title, publishedAt, views, thumbUrl,
 * isShort }. The feed carries Shorts too: the only sign in the feed is the
 * link, /shorts/{id} instead of watch?v={id} (its media:thumbnail is the same
 * 480 x 360 hqdefault.jpg; checked on LIGA BBVA MX and FMF, 2026-09-15). A
 * Short's url is its /shorts/ page. Entries without a valid video id, a title
 * or a date are dropped.
 */
import { elements, attr, plainText, parseDate } from "../news/parse.mjs";

export const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
export const CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/;
/** The only image host ever fetched: YouTube's thumbnail CDN (i.ytimg.com, i1-i9.ytimg.com). */
export const THUMB_HOST = /^i\d?\.ytimg\.com$/;

export const feedUrl = (channelId) => `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
export const watchUrl = (id) => `https://www.youtube.com/watch?v=${id}`;
export const shortUrl = (id) => `https://www.youtube.com/shorts/${id}`;
/** 320 x 180, the size Hoy shows: no crop, only a re-encode. */
export const mqThumbUrl = (id) => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
/** 480 x 360. For a Short, its vertical picture fills the centre 9:16 band (checked 2026-09-15). */
export const hqThumbUrl = (id) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

/** A thumbnail url from the feed, only when it is YouTube's own CDN over https. */
export function ytimgUrl(raw) {
  try {
    const u = new URL(String(raw ?? ""));
    if (u.protocol === "http:") u.protocol = "https:";
    return u.protocol === "https:" && THUMB_HOST.test(u.hostname) ? u.toString() : null;
  } catch { return null; }
}

const text = (xml, name) => { const e = elements(xml, name)[0]; return e ? plainText(e.inner) : ""; };

/**
 * Returns { channelId, channelName, entries, dropped }. Throws when the body is
 * not a YouTube Atom feed, so a blocked or changed feed is a failure, never "no videos".
 */
export function parseYouTubeFeed(xml) {
  const body = String(xml ?? "");
  if (!/<feed[\s>]/i.test(body)) throw new Error(/<html[\s>]/i.test(body) ? "not a feed (an HTML page)" : "not a feed (no Atom <feed>)");
  const head = body.split(/<entry[\s>]/i)[0];
  const channelLink = elements(head, "link").map((l) => attr(l.attrs, "href") ?? "").find((h) => /\/channel\/UC/.test(h)) ?? "";
  const channelId = channelLink.match(/\/channel\/(UC[A-Za-z0-9_-]{22})/)?.[1] ?? null;
  const channelName = text(head, "title") || null;
  const entries = [];
  let dropped = 0;
  for (const e of elements(body, "entry")) {
    const x = e.inner;
    const youtubeId = text(x, "yt:videoId");
    const title = text(x, "title").slice(0, 300);
    const link = elements(x, "link").map((l) => attr(l.attrs, "href") ?? "")[0] ?? "";
    const publishedAt = parseDate(elements(x, "published")[0]?.inner ?? "");
    if (!VIDEO_ID.test(youtubeId) || !title || !publishedAt) { dropped++; continue; }
    const rawViews = attr(elements(x, "media:statistics")[0]?.attrs ?? "", "views");
    const views = rawViews == null || rawViews === "" ? NaN : Number(rawViews);
    const thumb = elements(x, "media:thumbnail")[0];
    const isShort = /\/shorts\//.test(link);
    entries.push({
      youtubeId,
      url: isShort ? shortUrl(youtubeId) : watchUrl(youtubeId),
      title,
      publishedAt,
      views: Number.isSafeInteger(views) && views >= 0 ? views : null,
      thumbUrl: thumb ? ytimgUrl(attr(thumb.attrs, "url")) : null,
      isShort,
    });
  }
  return { channelId, channelName, entries, dropped };
}
