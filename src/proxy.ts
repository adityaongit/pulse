import type { NextRequest } from "next/server";
import { checkAccess } from "@/server/access";
import { getConfig } from "@/server/config";

// No matcher: every path, static assets included, needs the Access JWT (Cloudflare sends it on all of them).
export function proxy(req: NextRequest) {
  return checkAccess(req, getConfig().access);
}
