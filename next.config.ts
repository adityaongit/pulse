import type { NextConfig } from "next";

// Baked into the client at build time: the service worker is registered as /sw.js?v=<this>, so each build installs
// a fresh worker and the open app can offer "New version available".
const BUILD_ID = process.env.GIT_SHA || Date.now().toString(36);

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_BUILD_ID: BUILD_ID },
  output: "standalone",
  // Migrations are read from disk at boot (instrumentation.ts), so serverless bundles need the folder traced in.
  outputFileTracingIncludes: { "/**": ["./drizzle/**/*"] },
  // Client cache for visited pages (Next 16 keeps dynamic pages for 0 s by default, so every tab switch re-rendered
  // on the server behind a skeleton). A sync's router.refresh() clears it, so data is never older than the last sync.
  experimental: {
    staleTimes: { dynamic: 60, static: 300 },
    // Server Actions cap request bodies at 1 MB. The avatar upload is a browser-shrunk ~150 KB WebP checked against
    // AVATAR_MAX_BYTES (1 MB); 2 MB leaves room for multipart overhead so an at-limit file gets the action's message.
    serverActions: { bodySizeLimit: "2mb" },
  },
  // Lets another device on the LAN load the dev server (next dev only): DEV_ORIGINS=192.168.1.10,my-mac.local
  allowedDevOrigins: process.env.DEV_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean),
  // No framing (clickjacking on the sign-in form), no MIME sniffing, and no full URLs in Referer to other sites.
  async headers() {
    return [
      // The worker and its offline page must never be served stale, or an update could never arrive.
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }, { key: "Service-Worker-Allowed", value: "/" }] },
      { source: "/offline.html", headers: [{ key: "Cache-Control", value: "no-cache" }] },
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
  // A second `next dev` (the e2e server) needs its own build dir: Next locks one dev server per dir.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
