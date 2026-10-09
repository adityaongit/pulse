import { expect, it } from "vitest";
import { CYCLE_SYMPTOMS, LOG_TOOLS } from "@/lib/log";
import { ctxFor } from "../testing";
import { coachApproval, logTools } from "./logTools";

const male = ctxFor(undefined as never);
const female = { ...male, profile: { ...male.profile, sex: "female" as const } };
const symptomsOf = (t: ReturnType<typeof logTools>) =>
  (t.log_symptoms.inputSchema as unknown as { shape: { symptoms: { element: { options: string[] } } } }).shape.symptoms.element.options;

it("cycle tools and cycle symptoms exist only on a female profile", () => {
  expect(Object.keys(logTools(male))).toEqual(["log_water", "log_food", "log_weight", "log_mood", "log_symptoms"]);
  expect(Object.keys(logTools(female))).toEqual([...LOG_TOOLS]);
  expect(symptomsOf(logTools(male)).filter((s) => CYCLE_SYMPTOMS.has(s))).toEqual([]);
  expect(symptomsOf(logTools(female))).toEqual(expect.arrayContaining([...CYCLE_SYMPTOMS]));
});

it("every log tool waits for the user's approval", () => {
  expect(coachApproval).toEqual(Object.fromEntries(LOG_TOOLS.map((n) => [n, "user-approval"])));
});
