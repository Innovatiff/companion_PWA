/**
 * News pictures: two small JPEG copies of a publisher's image, made in pure
 * JavaScript (jpeg-js, pngjs) so the ingest image stays node:22-slim with no
 * native build step. WebP and AVIF have no reliable pure-JS decoder; an item
 * whose only image is one of those is stored without an image.
 *
 *   thumb  160 px wide, at most 10 KB
 *   lead   480 px wide, at most 45 KB
 *
 * Both share one crop: landscape between 4:3 and 2:1 (a taller picture keeps
 * its upper middle, where faces and headlines usually are; a wider one keeps
 * its centre). Downscaling is area-averaging, never an upscale: a source
 * narrower than the variant is shown at its own width, and one under
 * MIN_SOURCE_WIDTH (logos, icons, tracking pixels) is not used.
 */
import jpeg from "jpeg-js";
import { PNG } from "pngjs";

export const DOWNLOAD_MAX_BYTES = 2_000_000;
export const VARIANTS = {
  thumb: { width: 160, maxBytes: 10_000 },
  lead: { width: 480, maxBytes: 45_000 },
};
export const MIN_SOURCE_WIDTH = 300;
const MAX_PIXELS_MP = 30;              // refuse to decode anything bigger (memory)
const MIN_ASPECT = 4 / 3;
const MAX_ASPECT = 2;

/** The image kind from its first bytes, whatever the server said. */
export function sniff(bytes) {
  const b = bytes;
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b.length > 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

/** RGBA pixels, alpha composited on white. */
export function decode(bytes) {
  const kind = sniff(bytes);
  if (kind === "image/jpeg") {
    const img = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true, maxResolutionInMP: MAX_PIXELS_MP, maxMemoryUsageInMB: 512, tolerantDecoding: true });
    return { width: img.width, height: img.height, data: img.data };
  }
  if (kind === "image/png") {
    const png = PNG.sync.read(bytes);
    if (png.width * png.height > MAX_PIXELS_MP * 1e6) throw new Error("image too large");
    const d = png.data;
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3] / 255;
      if (a < 1) {
        d[i] = Math.round(d[i] * a + 255 * (1 - a));
        d[i + 1] = Math.round(d[i + 1] * a + 255 * (1 - a));
        d[i + 2] = Math.round(d[i + 2] * a + 255 * (1 - a));
        d[i + 3] = 255;
      }
    }
    return { width: png.width, height: png.height, data: d };
  }
  throw new Error(kind ? `${kind} is not decoded` : "not a JPEG or PNG");
}

/** The crop box {x, y, w, h} for a landscape picture between 4:3 and 2:1. */
export function cropBox(width, height) {
  const aspect = width / height;
  if (aspect > MAX_ASPECT) {
    const w = Math.round(height * MAX_ASPECT);
    return { x: Math.floor((width - w) / 2), y: 0, w, h: height };
  }
  if (aspect < MIN_ASPECT) {
    const h = Math.round(width / MIN_ASPECT);
    // Upper middle: a third of the spare height above, two thirds below.
    return { x: 0, y: Math.floor((height - h) / 3), w: width, h };
  }
  return { x: 0, y: 0, w: width, h: height };
}

/**
 * Area-averaging resize of the crop box of `src` (RGBA) to dw x dh (RGB out
 * as RGBA for jpeg-js). Each destination pixel is the coverage-weighted mean
 * of the source pixels under it, done as two separable passes.
 */
export function resizeArea(src, box, dw, dh) {
  const { x: bx, y: by, w: bw, h: bh } = box;
  const sw = src.width;
  // Horizontal pass: bw -> dw, over rows by..by+bh.
  const tmp = new Float32Array(dw * bh * 3);
  const sx = bw / dw;
  const xSpans = [];
  for (let dx = 0; dx < dw; dx++) {
    const x0 = dx * sx, x1 = x0 + sx;
    const span = [];
    for (let s = Math.floor(x0); s < Math.min(Math.ceil(x1), bw); s++) {
      const wgt = Math.min(s + 1, x1) - Math.max(s, x0);
      if (wgt > 0) span.push(s, wgt / sx);
    }
    xSpans.push(span);
  }
  for (let y = 0; y < bh; y++) {
    const row = (by + y) * sw;
    for (let dx = 0; dx < dw; dx++) {
      const span = xSpans[dx];
      let r = 0, g = 0, b = 0;
      for (let k = 0; k < span.length; k += 2) {
        const i = (row + bx + span[k]) * 4;
        const w = span[k + 1];
        r += src.data[i] * w; g += src.data[i + 1] * w; b += src.data[i + 2] * w;
      }
      const o = (y * dw + dx) * 3;
      tmp[o] = r; tmp[o + 1] = g; tmp[o + 2] = b;
    }
  }
  // Vertical pass: bh -> dh.
  const out = Buffer.alloc(dw * dh * 4);
  const sy = bh / dh;
  for (let dy = 0; dy < dh; dy++) {
    const y0 = dy * sy, y1 = y0 + sy;
    for (let dx = 0; dx < dw; dx++) {
      let r = 0, g = 0, b = 0;
      for (let s = Math.floor(y0); s < Math.min(Math.ceil(y1), bh); s++) {
        const w = (Math.min(s + 1, y1) - Math.max(s, y0)) / sy;
        if (w <= 0) continue;
        const i = (s * dw + dx) * 3;
        r += tmp[i] * w; g += tmp[i + 1] * w; b += tmp[i + 2] * w;
      }
      const o = (dy * dw + dx) * 4;
      out[o] = Math.min(255, Math.round(r)); out[o + 1] = Math.min(255, Math.round(g)); out[o + 2] = Math.min(255, Math.round(b)); out[o + 3] = 255;
    }
  }
  return out;
}

/** JPEG at the highest quality (by default from 80 down to 30) that fits `maxBytes`, or null. */
export function encodeWithin(data, width, height, maxBytes, qualities = [80, 72, 64, 56, 48, 40, 30]) {
  for (const q of qualities) {
    const bytes = jpeg.encode({ data, width, height }, q).data;
    if (bytes.length <= maxBytes) return { bytes: Buffer.from(bytes), quality: q };
  }
  return null;
}

/**
 * Both variants from downloaded bytes, or throws with the reason.
 * Returns { thumb: {bytes, width, height}, lead: {bytes, width, height}, source: {width, height} }.
 */
export function makeVariants(bytes) {
  if (!bytes?.length) throw new Error("empty image");
  if (bytes.length > DOWNLOAD_MAX_BYTES) throw new Error(`image over ${DOWNLOAD_MAX_BYTES} bytes`);
  const src = decode(bytes);
  if (src.width < MIN_SOURCE_WIDTH) throw new Error(`image only ${src.width} px wide`);
  const box = cropBox(src.width, src.height);
  const out = { source: { width: src.width, height: src.height } };
  for (const [name, v] of Object.entries(VARIANTS)) {
    const width = Math.min(v.width, box.w);
    const height = Math.max(1, Math.round(width * box.h / box.w));
    const pixels = resizeArea(src, box, width, height);
    const enc = encodeWithin(pixels, width, height, v.maxBytes);
    if (!enc) throw new Error(`${name} does not fit ${v.maxBytes} bytes`);
    out[name] = { bytes: enc.bytes, width, height, quality: enc.quality };
  }
  return out;
}
