/**
 * The owner portal. Same rule as the other two surfaces: server-rendered HTML,
 * client runtime JS disabled on every page (`unstable_runtimeJS: false`),
 * inline CSS. Interactivity is plain HTML forms posting to pages/api/*.
 *
 * @type {import('next').NextConfig}
 */
import path from "node:path";

export default {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  output: "standalone",
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  transpilePackages: ["@leamington/shared"],
  async rewrites() {
    return [{ source: "/health", destination: "/api/health" }];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Setup links carry a one-time token in the URL: never leak it in a Referer.
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};
