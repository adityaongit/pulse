// The coach's one-line take on a workout (activity-01's "Analyzing…" pill): POST { id }. Same gate as the chat
// (signed in, coach access, a usable model, the per-minute limit); the workout is read for this user only. Never logs
// the text, the numbers or provider bodies.
import { generateText } from "ai";
import { z } from "zod";
import { requestUser } from "@/server/auth";
import { coachInstructions } from "@/server/coach/instructions";
import { allowRequest, coachModel } from "@/server/coach/store";
import { coachTexts } from "@/server/coach/texts";
import { getDb } from "@/server/db";
import { getActivity } from "@/server/queries/activity";
import { ctxOf } from "@/server/queries/common";
import type { ActivityVM } from "@/server/queries/types";

const Body = z.object({ id: z.string().min(1).max(200) }).strict();
const fail = (status: number, error: string) => Response.json({ error }, { status });

/** The workout's numbers as plain lines for the model: only what the screen shows. */
export function workoutFacts(a: ActivityVM): string {
  const f = (n: number | null | undefined, d = 1) => (n == null ? "unknown" : n.toFixed(d));
  const lines = [
    `Activity: ${a.name}, ${Math.round((a.end - a.start) / 60_000)} minutes.`,
    `Strain: ${f(a.strain.value)} (usual for ${a.name.toLowerCase()}: ${f(a.strainAverage)}).`,
    ...a.stats.map((s) => `${s.label}: ${f(s.metric.value, 0)}${s.unit ? ` ${s.unit}` : ""} (usual: ${f(s.average, 0)}).`),
    ...(a.steps ? [`Steps: ${a.steps.value} (usual: ${f(a.steps.average, 0)}).`] : []),
    ...(a.zones.value ?? []).map((z) => `${z.label}: ${Math.round(z.seconds / 60)} minutes.`),
  ];
  return lines.join("\n");
}

export async function POST(req: Request) {
  const user = await requestUser(req);
  if (!user) return fail(401, "signed_out");
  const db = getDb();
  const m = await coachModel(db, user.userId);
  if ("problem" in m) return m.problem === "no_access" ? fail(404, "not_found") : fail(409, "key");
  if (!allowRequest(user.userId)) return fail(429, "limit");
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return fail(400, "bad_request");
  const ctx = await ctxOf(db, user.userId).catch(() => null);
  if (!ctx) return fail(409, "profile");
  const activity = await getActivity(body.data.id, ctx);
  if (!activity) return fail(404, "not_found");
  const texts = await coachTexts(db);
  try {
    const { text } = await generateText({
      model: m.model,
      instructions: coachInstructions(ctx, texts, m.instructions),
      prompt: `${texts("workout_glance")}\n\n${workoutFacts(activity)}`,
      maxOutputTokens: 80,
      abortSignal: req.signal,
    });
    return Response.json({ text: text.trim() });
  } catch (e) {
    console.warn(`[coach] workout glance via ${m.provider} failed: ${e instanceof Error ? e.name : "error"}`);
    return fail(502, "provider");
  }
}
