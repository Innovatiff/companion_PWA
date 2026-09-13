// Generates public/icon-192.png and public/icon-512.png for "Hoy" with no image
// library: a light H on a dark field, encoded as PNG by hand. Solid shapes
// compress to a few hundred bytes, which matters when Chrome fetches them to
// install.
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

function png(size) {
  const BG = [0x10, 0x23, 0x1c];
  const FG = [0xf6, 0xf3, 0xea];
  const row = size * 3 + 1;
  const raw = Buffer.alloc(row * size);
  // An H, kept inside the maskable safe zone (the central 80% circle).
  const inH = (x, y) => {
    const u = (x + 0.5) / size;
    const v = (y + 0.5) / size;
    if (v < 0.29 || v > 0.71) return false;
    const leftStem = u >= 0.31 && u <= 0.41;
    const rightStem = u >= 0.59 && u <= 0.69;
    const bar = u > 0.41 && u < 0.59 && v >= 0.46 && v <= 0.54;
    return leftStem || rightStem || bar;
  };
  for (let y = 0; y < size; y++) {
    raw[y * row] = 0;                  // filter: none
    for (let x = 0; x < size; x++) {
      const colour = inH(x, y) ? FG : BG;
      raw.set(colour, y * row + 1 + x * 3);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 2;   // colour type: RGB
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

for (const size of [192, 512]) {
  const file = new URL(`../public/icon-${size}.png`, import.meta.url);
  const bytes = png(size);
  writeFileSync(file, bytes);
  console.log(`icon-${size}.png  ${bytes.length} bytes`);
}
