import type { MetadataRoute } from "next";

// The root layout links this with crossorigin="use-credentials": without cookies, Cloudflare Access
// would redirect the manifest fetch and Chrome would see no manifest (plan U12).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Pulse: recovery, strain and sleep",
    short_name: "Pulse",
    description: "Recovery, strain and sleep from your Fitbit Air, scored the WHOOP way.",
    start_url: "/",
    display: "standalone",
    background_color: "#0f1113",
    theme_color: "#0f1113",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
