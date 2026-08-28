import type { NextConfig } from "next";

// Deliberately minimal. This app must run on any Node host (Hostinger today).
// Do NOT add `output: 'export'` — it disables server actions and API routes,
// which this CRM depends on entirely. See docs/DEPLOYMENT.md.
const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The dev overlay badge sits bottom-left, exactly on top of the sidebar's
  // user block and Sign out button, and swallows clicks there during QA.
  devIndicators: false,
};

export default nextConfig;
