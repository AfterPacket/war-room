import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow cross-origin requests from local network devices in dev
  allowedDevOrigins: ['192.168.20.171', '192.168.0.0/16', '10.0.0.0/8', '172.16.0.0/12'],
  // Pin Turbopack's root to this project directory.
  // Without this, it picks up C:\Users\jorda\package-lock.json and corrupts its cache.
  turbopack: {
    root: __dirname,
  },
  // Move from experimental
  serverExternalPackages: ['better-sqlite3'],
  // Image domains for news thumbnails
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.mapbox.com' },
      { protocol: 'https', hostname: 'i.ytimg.com' },
    ],
  },
};

export default nextConfig;
