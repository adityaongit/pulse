import { getDb } from "@/server/db";
import { uploadedAvatar } from "@/server/avatar";

/** The uploaded avatar. Behind the sign-in proxy like every page; `?v=` busts the cache on a new upload. */
export function GET() {
  const a = uploadedAvatar(getDb());
  if (!a) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(a.bytes), {
    headers: { "content-type": a.type, "cache-control": "private, max-age=31536000, immutable", "x-content-type-options": "nosniff" },
  });
}
