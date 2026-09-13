/**
 * Hoy, the client PWA. Payload is the product: a cheap Android on 2 bars of
 * bunkhouse wifi and metered prepaid data. So every page is server-rendered
 * HTML with client runtime JS disabled (`unstable_runtimeJS: false` per page),
 * inline CSS, and one small inline script of our own.
 *
 * @type {import('next').NextConfig}
 */
import path from "node:path";

export default {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  output: "standalone",
  // The monorepo root, so the standalone server includes packages/shared.
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  transpilePackages: ["@leamington/shared"],
  async rewrites() {
    return [{ source: "/health", destination: "/api/health" }];
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/manifest.webmanifest",
        headers: [
          { key: "Content-Type", value: "application/manifest+json" },
          { key: "Cache-Control", value: "public, max-age=86400" },
        ],
      },
      {
        source: "/icon-:size.png",
        headers: [{ key: "Cache-Control", value: "public, max-age=604800" }],
      },
    ];
  },
};
