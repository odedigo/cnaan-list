import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  agentRules: false,
  // The browser cannot read PRODUCTION from .env.local. Inline it so the public Supabase keys can switch.
  env: {
    PRODUCTION: process.env.PRODUCTION ?? "false",
  },
};

export default nextConfig;
