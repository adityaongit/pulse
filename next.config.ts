import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["better-sqlite3"],
  // Lets a phone on the LAN load the dev server (next dev only).
  allowedDevOrigins: ["192.168.1.10"],
};

export default nextConfig;
