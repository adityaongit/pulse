"use server";
// The sync popover's and Settings' "Sync now".
import { revalidatePath } from "next/cache";
import { currentSession, SIGNED_OUT } from "../auth";
import { syncErrorText } from "../queries/settings";
import { syncAndWait } from "../worker";
import type { ActionResult } from "./journal";

export async function syncNow(): Promise<ActionResult> {
  if (!(await currentSession())) return SIGNED_OUT;
  const r = await syncAndWait();
  revalidatePath("/", "layout");
  return r.ok ? { ok: true, data: undefined } : { ok: false, error: r.error ? syncErrorText(r.error) : "Sync failed" };
}
