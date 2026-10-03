import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["better-sqlite3"],
  // Lets another device on the LAN load the dev server (next dev only): DEV_ORIGINS=192.168.1.10,my-mac.local
  allowedDevOrigins: process.env.DEV_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean),
  // A second `next dev` (the e2e server) needs its own build dir: Next locks one dev server per dir.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
