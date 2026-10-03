"use server";
// Disconnect Google (spec §7.14): revoke every permission at Google and forget the grant; stored health data stays on this server.
import { revalidatePath } from "next/cache";
import { currentSession, SIGNED_OUT } from "@/server/auth";
import { getConfig } from "@/server/config";
import { getDb } from "@/server/db";
import { revokeGrant } from "@/server/sources/google/oauth";
import type { ActionResult } from "@/server/actions/journal";

export async function disconnectGoogle(): Promise<ActionResult> {
  if ((await currentSession())?.kind !== "owner") return SIGNED_OUT;
  if (!getConfig().google) return { ok: false, error: "Google is not enabled" };
  const db = getDb();
  try {
    await revokeGrant(db);
  } catch {
    return { ok: false, error: "Couldn't reach Google to remove access. Try again." };
  }
  // The old grant's sync errors (revoked, not linked) no longer describe anything.
  db.$client.prepare("update sync_state set last_error = null").run();
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}
