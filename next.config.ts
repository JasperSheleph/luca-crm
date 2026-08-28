import type { NextConfig } from "next";

// Deliberately minimal. This app must run on any Node host (Hostinger today).
// Do NOT add `output: 'export'` — it disables server actions and API routes,
// which this CRM depends on entirely. See docs/DEPLOYMENT.md.
const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
