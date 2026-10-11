import type { NextRequest } from "next/server";
import { requestUser } from "@/server/auth";
import { getDb } from "@/server/db";
import { ctxOf } from "@/server/queries/common";
import { getShellStatus } from "@/server/queries/settings";
import { requestSync } from "@/server/worker";

/**
 * The signed-in user's shell status as JSON, polled by ShellStatusProvider while a sync or import runs so the sync
 * ring and import progress move without a reload. Behind the sign-in proxy; the handler checks the session itself.
 */
export async function GET(req: NextRequest) {
  const user = await requestUser(req);
  if (!user) return Response.json({ error: "signed_out" }, { status: 401 });
  // The same fire-and-forget as the (app) layout: a resumed app (AppLifecycle) checks in here instead of
  // re-rendering every screen, and the worker's gates make repeated polls free.
  requestSync({ userId: user.userId });
  return Response.json(await getShellStatus(await ctxOf(getDb(), user.userId)), { headers: { "cache-control": "no-store" } });
}
