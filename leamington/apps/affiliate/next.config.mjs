import path from "node:path";

/**
 * The affiliate portal. Used at a counter with a line waiting, on whatever phone
 * or tablet the shop has. Every page is server-rendered HTML with client runtime
 * JS disabled (`unstable_runtimeJS: false` per page) and inline CSS; forms POST
 * to /api/* and redirect with 303.
 *
 * @type {import('next').NextConfig}
 */
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
};
