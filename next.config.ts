import path from "node:path";
import type { NextConfig } from "next";

// Deliberately minimal. This app must run on any Node host (Hostinger today).
// Do NOT add `output: 'export'` — it disables server actions and API routes,
// which this CRM depends on entirely. See docs/DEPLOYMENT.md.
const nextConfig: NextConfig = {
  reactStrictMode: true,

  /**
   * Pin the project root.
   *
   * There is an unrelated package-lock.json sitting in the home directory above
   * this repo, and Turbopack infers the root from the nearest lockfile — so it
   * was reaching outside the project and warning about it on every build. On a
   * build machine that guess could resolve modules from somewhere unintended,
   * which is a bad thing to discover at deploy time.
   */
  turbopack: { root: path.resolve(__dirname) },
  // The dev overlay badge sits bottom-left, exactly on top of the sidebar's
  // user block and Sign out button, and swallows clicks there during QA.
  devIndicators: false,

  /**
   * Lets a phone on the same Wi-Fi load this dev server.
   *
   * Next blocks cross-origin requests for /_next/dev resources by default, so
   * reaching the laptop at its LAN address serves the HTML but refuses the
   * JavaScript. The page then looks fine and does nothing: filters are dead and
   * a row click falls through to the plain link instead of the slide-over.
   *
   * DEVELOPMENT ONLY — Next ignores this when built for production, so it is
   * not a hole in the deployed app. If the laptop's address changes, update the
   * entry below; `npm run dev:lan` prints the current one.
   */
  allowedDevOrigins: ["192.168.68.108", "192.168.68.*", "*.local"],
};

export default nextConfig;
