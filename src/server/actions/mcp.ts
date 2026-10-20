"use server";
// Settings › Agents: make and revoke the personal access tokens an AI agent uses at /api/mcp. Each checks the session
// itself and touches only the signed-in user's own tokens.
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { currentUser, SIGNED_OUT } from "../auth";
import { getDb } from "../db";
import { createToken, listTokens, MAX_NAME, MAX_TOKENS, revokeToken } from "../mcp/tokens";
import type { ActionResult } from "./journal";

const Name = z.string().trim().min(1, "Name the agent that will use it").max(MAX_NAME, `Use at most ${MAX_NAME} characters`);

/** Returns the new token: the only time it is shown. */
export async function createMcpTokenAction(name: string): Promise<ActionResult<string>> {
  const me = await currentUser();
  if (!me) return SIGNED_OUT;
  const r = Name.safeParse(name);
  if (!r.success) return { ok: false, error: r.error.issues[0].message };
  const db = getDb();
  if ((await listTokens(db, me.userId)).length >= MAX_TOKENS) return { ok: false, error: `You can have ${MAX_TOKENS} tokens. Revoke one first.` };
  const token = await createToken(db, me.userId, r.data);
  revalidatePath("/settings");
  return { ok: true, data: token };
}

export async function revokeMcpTokenAction(id: number): Promise<ActionResult> {
  const me = await currentUser();
  if (!me) return SIGNED_OUT;
  if (!Number.isInteger(id)) return { ok: false, error: "That token doesn’t exist." };
  await revokeToken(getDb(), me.userId, id);
  revalidatePath("/settings");
  return { ok: true, data: undefined };
}
