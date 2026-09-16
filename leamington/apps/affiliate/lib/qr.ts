/**
 * A QR code as a compact inline SVG, drawn on the server: no image request, no
 * client JS, no third-party service. One path of horizontal runs per row, with
 * the 4-module quiet zone scanners need.
 */
import QRCode from "qrcode";

const cache = new Map<string, string>();

export function qrSvg(text: string, label: string): string {
  const key = `${label}\n${text}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const { modules } = QRCode.create(text, { errorCorrectionLevel: "M" });
  const n = modules.size;
  const q = 4;
  let d = "";
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (!modules.get(y, x)) continue;
      let run = 1;
      while (x + run < n && modules.get(y, x + run)) run++;
      d += `M${x + q} ${y + q}h${run}v1h-${run}z`;
      x += run - 1;
    }
  }
  const size = n + q * 2;
  const escaped = label.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  const svg = `<svg class="qr" viewBox="0 0 ${size} ${size}" role="img" aria-label="${escaped}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
  cache.set(key, svg);
  return svg;
}
