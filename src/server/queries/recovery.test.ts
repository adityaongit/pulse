// Recovery's rows, insight and behaviour chips (spec §11 R34).
import { beforeAll, describe, expect, it } from "vitest";
import { BEHAVIOR_LABEL } from "@/core/algorithms/behaviorChips";
import type { Db } from "../db";
import { ctxFor, dayAt, seeded } from "../testing";
import { getRecovery, screenInsight } from "./recovery";

let db: Db;
beforeAll(async () => {
  db = await seeded();
});

describe("getRecovery", () => {
  it("shows the reference app's four rows against the last 30 days, each opening its Trend View", async () => {
    const vm = await getRecovery(dayAt(150), ctxFor(db));
    expect(vm.summary.map((s) => s.key)).toEqual(["hrv", "rhr", "resp", "sleep"]);
    expect(vm.summary.map((s) => s.href)).toEqual(["/trend/hrv", "/trend/rhr", "/trend/resp", "/trend/sleep"]);
    expect(vm.summary.map((s) => s.unit ?? null)).toEqual([null, null, null, "%"]);
    expect(vm.summary.find((s) => s.key === "resp")!.direction).toBe("down");
    for (const s of vm.summary) expect(s.average).not.toBeNull();
    expect(vm.contributors.map((c) => c.key)).toContain("skinTemp");
  });

  it("words the insight around one input and the band", async () => {
    const vm = await getRecovery(dayAt(150), ctxFor(db));
    expect(vm.insight).toMatch(/^Your .+ \(.+\) is (within|above|below) its typical range of .+ to .+, which contributed to a (green|yellow|red) Recovery\. /);
  });

  it("lists yesterday's behaviours as chips with a known label and tone", async () => {
    const vm = await getRecovery(dayAt(150), ctxFor(db));
    for (const c of vm.behaviors) {
      expect(BEHAVIOR_LABEL[c.key]).toBe(c.label);
      expect(["up", "down", "neutral"]).toContain(c.effect);
    }
  });
});

describe("screenInsight", () => {
  it("falls back to the band when no input has a baseline", () => {
    expect(screenInsight([], 80)).toBe("Your Recovery is green. Your body is primed to take on strain today.");
  });
});
