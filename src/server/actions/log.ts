"use server";
// Logging from Pulse (spec §11 LG1): session-checked here, validated and written in ../logging.ts.
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { currentUser, SIGNED_OUT } from "../auth";
import { getConfig } from "../config";
import { getDb } from "../db";
import { deleteEntry, isReadable, rewindSync } from "../log";
import { LOG_MESSAGE, logFor, logWriter, type LogInput } from "../logging";
import { userTimeZone } from "../profile";
import { requestSync } from "../worker";
import type { ActionResult } from "./journal";

export type { LogInput };

/** Logs water, food, weight (and body fat), mood, symptoms, or (female profiles) a period or ovulation test. */
export async function logEntry(input: LogInput): Promise<ActionResult<{ demo: boolean }>> {
  const user = await currentUser();
  if (!user) return SIGNED_OUT;
  return logFor(user.userId, input);
}

const Delete = z.object({ id: z.uuid() });

/** Deletes a logged entry here and, when it was written there, at Google. */
export async function deleteLogEntry(input: z.input<typeof Delete>): Promise<ActionResult> {
  const user = await currentUser();
  if (!user) return SIGNED_OUT;
  const { userId } = user;
  const r = Delete.safeParse(input);
  if (!r.success) return { ok: false, error: r.error.issues[0].message };
  const { dataSource } = getConfig();
  const tz = dataSource === "google" ? ((await userTimeZone(getDb(), userId)) ?? "UTC") : "UTC";
  const res = await deleteEntry(getDb(), userId, r.data.id, dataSource === "google" ? logWriter(userId, tz) : null);
  revalidatePath("/journal");
  if (!res.ok) return { ok: false, error: LOG_MESSAGE[res.reason] };
  if (dataSource === "google" && res.type && res.day && isReadable(res.type)) {
    await rewindSync(getDb(), userId, res.type, res.day, tz);
    requestSync({ userId, force: true });
  }
  return { ok: true, data: undefined };
}
