/**
 * Video thumbnails: one small JPEG of YouTube's own thumbnail, made with the
 * news pictures' pure-JS pipeline (news/image.mjs: decode, area resize, JPEG
 * at the best quality that fits).
 *
 *   320 px wide (never upscaled), 16:9, at most 14 KB
 *
 * mqdefault.jpg is already 320 x 180. The feed's hqdefault.jpg is 480 x 360
 * with black bars above and below a 16:9 picture, so the centre 16:9 band is
 * kept. Only i.ytimg.com (and its i1-i9 mirrors) is ever fetched.
 */
import { decode, resizeArea, encodeWithin, sniff } from "../news/image.mjs";

export const THUMB = {
  width: 320,
  widths: [320, 288],                                  // 288 x 162 only when 320 x 180 does not fit at any quality
  qualities: [80, 72, 64, 56, 48, 40, 32, 26, 20],
  maxBytes: 14_000, downloadMaxBytes: 300_000, minSourceWidth: 120,
};

/** The centre 16:9 box of a picture (letterbox bars removed), or the whole picture when it is wider. */
export function box169(width, height) {
  const h = Math.round(width * 9 / 16);
  if (h <= height) return { x: 0, y: Math.floor((height - h) / 2), w: width, h };
  const w = Math.round(height * 16 / 9);
  return { x: Math.floor((width - w) / 2), y: 0, w, h: height };
}

/** { bytes, width, height, quality } from downloaded bytes, or throws with the reason. */
export function makeThumb(bytes) {
  if (!bytes?.length) throw new Error("empty image");
  if (bytes.length > THUMB.downloadMaxBytes) throw new Error(`image over ${THUMB.downloadMaxBytes} bytes`);
  if (sniff(bytes) !== "image/jpeg") throw new Error(`not a JPEG (${sniff(bytes) ?? "unknown"})`);
  const src = decode(bytes);
  if (src.width < THUMB.minSourceWidth) throw new Error(`image only ${src.width} px wide`);
  const box = box169(src.width, src.height);
  // Busy pictures (crowds, small text) need a lower quality than news pictures; then a slightly narrower copy.
  for (const w of THUMB.widths) {
    const width = Math.min(w, box.w);
    const height = Math.max(1, Math.round(width * box.h / box.w));
    const enc = encodeWithin(resizeArea(src, box, width, height), width, height, THUMB.maxBytes, THUMB.qualities);
    if (enc) return { bytes: enc.bytes, width, height, quality: enc.quality };
  }
  throw new Error(`thumb does not fit ${THUMB.maxBytes} bytes`);
}

/*
 * A Short's thumbnail: vertical, 180 x 320 (162 x 288 when a busy picture does
 * not fit), at most 14 KB. hqdefault.jpg of a Short is 480 x 360 with the
 * vertical picture in the centre 9:16 band (202 x 360) and dark bars at the
 * sides, so that band is kept.
 */
export const SHORT_THUMB = { width: 180, widths: [180, 162], minSourceHeight: 240 };

/** The centre 9:16 box of a picture. */
export function box916(width, height) {
  const w = Math.round(height * 9 / 16);
  if (w <= width) return { x: Math.floor((width - w) / 2), y: 0, w, h: height };
  const h = Math.round(width * 16 / 9);
  return { x: 0, y: Math.floor((height - h) / 2), w: width, h };
}

export function makeShortThumb(bytes) {
  if (!bytes?.length) throw new Error("empty image");
  if (bytes.length > THUMB.downloadMaxBytes) throw new Error(`image over ${THUMB.downloadMaxBytes} bytes`);
  if (sniff(bytes) !== "image/jpeg") throw new Error(`not a JPEG (${sniff(bytes) ?? "unknown"})`);
  const src = decode(bytes);
  if (src.height < SHORT_THUMB.minSourceHeight) throw new Error(`image only ${src.height} px high`);
  const box = box916(src.width, src.height);
  for (const w of SHORT_THUMB.widths) {
    const width = Math.min(w, box.w);
    // The box is 9:16 to the nearest pixel (202.5 wide in a 360 high picture): the thumbnail is exactly 9:16.
    const height = Math.round(width * 16 / 9);
    const enc = encodeWithin(resizeArea(src, box, width, height), width, height, THUMB.maxBytes, THUMB.qualities);
    if (enc) return { bytes: enc.bytes, width, height, quality: enc.quality };
  }
  throw new Error(`thumb does not fit ${THUMB.maxBytes} bytes`);
}
