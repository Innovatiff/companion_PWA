/** Test pictures for the news feed. */
import jpeg from "jpeg-js";

/** A photo-like JPEG: smooth gradients with texture, so the encoder has real work to do. */
export function photoJpeg(width, height, quality = 90) {
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    data[i] = (x * 255 / width + 30 * Math.sin(x / 7) * Math.cos(y / 11)) & 255;
    data[i + 1] = (y * 255 / height + 25 * Math.sin((x + y) / 5)) & 255;
    data[i + 2] = (128 + 60 * Math.sin(x / 23) + 40 * Math.cos(y / 3)) & 255;
    data[i + 3] = 255;
  }
  return Buffer.from(jpeg.encode({ data, width, height }, quality).data);
}
