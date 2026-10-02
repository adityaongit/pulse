"use server";
// Disconnect Google (spec §7.14): forget the grant; stored health data stays on this server.
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getConfig } from "@/server/config";
import { getDb } from "@/server/db";
import { oauthTokens } from "@/server/db/schema";
import type { ActionResult } from "@/server/actions/journal";

export async function disconnectGoogle(): Promise<ActionResult> {
  if (!getConfig().google) return { ok: false, error: "Google is not enabled" };
  getDb().delete(oauthTokens).where(eq(oauthTokens.id, 1)).run();
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}
