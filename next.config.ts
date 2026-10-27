import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  agentRules: false,
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }],
      },
      {
        source: "/site.webmanifest",
        headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }],
      },
    ];
  },
  // The browser cannot read PRODUCTION from .env.local. Inline it so the public Supabase keys can switch.
  env: {
    PRODUCTION: process.env.PRODUCTION ?? "false",
  },
};

export default nextConfig;
