// The coach's write tools: each logs one entry through the same path as the log sheets (../logging.ts), for the
// signed-in user only. Every call waits for the user's approval in the chat (`coachApproval`); the cycle tools exist
// only on a female profile, as the sheets do.
import { tool } from "ai";
import { z } from "zod";
import { CYCLE_SYMPTOMS, FLOWS, LOG_TOOLS, MEALS, MOODS, OVULATION_RESULTS, SYMPTOMS, VALENCES, type LogToolName } from "@/lib/log";
import { logFor, type LogInput } from "../logging";
import type { QueryCtx } from "../queries/common";
import { defaultTexts, type Texts } from "./texts";

const keys = <T extends readonly (readonly [string, ...unknown[]])[]>(list: T) => list.map((x) => x[0]) as unknown as [T[number][0], ...T[number][0][]];
const At = (description: string) => z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/).optional().describe(description);

/** What a log tool returns: saved, or why not (the log sheets' wording). */
export type LogOutput = { logged: true } | { logged: false; error: string };

async function save(ctx: QueryCtx, input: LogInput): Promise<LogOutput> {
  const r = await logFor(ctx.userId, input);
  return r.ok ? { logged: true } : { logged: false, error: r.error };
}

export function logTools(ctx: QueryCtx, t: Texts = defaultTexts) {
  const female = ctx.profile.sex === "female";
  const symptoms = SYMPTOMS.filter((s) => female || !CYCLE_SYMPTOMS.has(s[0]));
  const base = {
    log_water: tool({
      description: t("tool.log_water"),
      inputSchema: z.object({ ml: z.number().int().min(10).max(5000).describe(t("tool.log_water.ml")), at: At(t("tool.log_water.at")) }),
      execute: ({ ml, at }) => save(ctx, { kind: "water", ml, at }),
    }),
    log_food: tool({
      description: t("tool.log_food"),
      inputSchema: z.object({
        name: z.string().max(80).optional().describe(t("tool.log_food.name")),
        meal: z.enum(keys(MEALS)).describe(t("tool.log_food.meal")),
        kcal: z.number().int().min(0).max(10_000).describe(t("tool.log_food.kcal")),
        protein: z.number().min(0).max(1000).optional().describe(t("tool.log_food.protein")),
        carbs: z.number().min(0).max(1000).optional().describe(t("tool.log_food.carbs")),
        fat: z.number().min(0).max(1000).optional().describe(t("tool.log_food.fat")),
        at: At(t("tool.log_food.at")),
      }),
      execute: ({ name, meal, kcal, protein, carbs, fat, at }) => save(ctx, { kind: "food", name: name ?? "", meal, kcal, protein: protein ?? null, carbs: carbs ?? null, fat: fat ?? null, at }),
    }),
    log_weight: tool({
      description: t("tool.log_weight"),
      inputSchema: z.object({
        kg: z.number().min(20).max(300).describe(t("tool.log_weight.kg")),
        fatPct: z.number().min(2).max(75).optional().describe(t("tool.log_weight.fatPct")),
        at: At(t("tool.log_weight.at")),
      }),
      execute: ({ kg, fatPct, at }) => save(ctx, { kind: "weight", kg, fatPct: fatPct ?? null, at }),
    }),
    log_mood: tool({
      description: t("tool.log_mood"),
      inputSchema: z.object({
        moods: z.array(z.enum(keys(MOODS))).min(1).max(5).describe(t("tool.log_mood.moods")),
        valence: z.enum(keys(VALENCES)).optional().describe(t("tool.log_mood.valence")),
        at: At(t("tool.log_mood.at")),
      }),
      execute: ({ moods, valence, at }) => save(ctx, { kind: "mood", moods, valence: valence ?? null, at }),
    }),
    log_symptoms: tool({
      description: t("tool.log_symptoms"),
      inputSchema: z.object({
        symptoms: z.array(z.enum(keys(symptoms))).min(1).max(10).describe(t("tool.log_symptoms.symptoms")),
        at: At(t("tool.log_symptoms.at")),
      }),
      execute: ({ symptoms, at }) => save(ctx, { kind: "symptoms", symptoms, at }),
    }),
  };
  if (!female) return base;
  return {
    ...base,
    log_period: tool({
      description: t("tool.log_period"),
      inputSchema: z.object({
        start: z.iso.date().describe(t("tool.log_period.start")),
        end: z.iso.date().describe(t("tool.log_period.end")),
        flow: z.enum(keys(FLOWS)).optional().describe(t("tool.log_period.flow")),
      }),
      execute: ({ start, end, flow }) => save(ctx, { kind: "period", start, end, flow: flow ?? null }),
    }),
    log_ovulation: tool({
      description: t("tool.log_ovulation"),
      inputSchema: z.object({ result: z.enum(keys(OVULATION_RESULTS)).describe(t("tool.log_ovulation.result")), at: At(t("tool.log_ovulation.at")) }),
      execute: ({ result, at }) => save(ctx, { kind: "ovulation", result, at }),
    }),
  };
}

/** Every log tool waits for the user's tap; the read tools run as before. */
export const coachApproval = Object.fromEntries(LOG_TOOLS.map((name) => [name, "user-approval"])) as Partial<Record<LogToolName, "user-approval">>;
