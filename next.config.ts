import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["better-sqlite3"],
  // Lets a phone on the LAN load the dev server (next dev only).
  allowedDevOrigins: ["192.168.1.71"],
  // A second `next dev` (the e2e server) needs its own build dir: Next locks one dev server per dir.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
