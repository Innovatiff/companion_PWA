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
    return [
      { source: "/health", destination: "/api/health" },
      // Team crests, from our own database (0033).
      { source: "/crest/:id", destination: "/api/crest/:id" },
      // League logos, from our own database (0036).
      { source: "/league-crest/:id", destination: "/api/league-crest/:id" },
      // Hometown photos, from our own database (0034).
      { source: "/photo/:id", destination: "/api/photo/:id" },
      // A town's gallery, photos 1-6, from our own database (0045).
      { source: "/photo/:id/:rank", destination: "/api/photo/:id/:rank" },
      // A football video's thumbnail, our cached copy (0049).
      { source: "/video-thumb/:id", destination: "/api/video-thumb/:id" },
      // A news story's picture, our cached copy: thumb or lead (0047).
      { source: "/news-image/:id/:size", destination: "/api/news-image/:id/:size" },
    ];
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
        // Illustrations: pages link them with ?v=, so a change is a new URL.
        source: "/art/:file*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=2592000, immutable" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
      {
        source: "/icon-:size.png",
        headers: [{ key: "Cache-Control", value: "public, max-age=604800" }],
      },
    ];
  },
};
