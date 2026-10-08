import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../db";
import { ctxFor, dayAt, seeded } from "../testing";
import { getTrendView, isTrendViewKey, TREND_VIEW, type TrendViewKey } from "./trendView";

let db: Db;
beforeAll(async () => {
  db = await seeded();
});

describe("getTrendView", () => {
  it("every metric builds a window, a prior and a verdict", async () => {
    for (const key of Object.keys(TREND_VIEW) as TrendViewKey[]) {
      if (!isTrendViewKey(key)) continue;
      const vm = await getTrendView(key, dayAt(150), "w", 0, ctxFor(db));
      expect(vm.bars, key).toHaveLength(7);
      expect(vm.to, key).toBe(dayAt(150));
      expect(vm.verdict, key).toMatch(/\.$/);
      expect(vm.options.map((o) => o.key), key).toContain(key);
    }
  });

  it("steps back whole periods and compares with the one before", async () => {
    const now = await getTrendView("hrv", dayAt(150), "m", 0, ctxFor(db));
    const back = await getTrendView("hrv", dayAt(150), "m", 1, ctxFor(db));
    expect(back.to).toBe(dayAt(120));
    expect(now.prior).toBeCloseTo(back.value!, 6);
    expect(now.typical![0]).toBeLessThan(now.typical![1]);
    expect(now.period).toMatch(/^\w{3} \d+ - \w{3} \d+, \d{2}$/);
  });

  it("6M has month segments; weekly metrics total by week", async () => {
    const six = await getTrendView("recovery", dayAt(150), "6m", 0, ctxFor(db));
    expect(six.segments!.length).toBeGreaterThanOrEqual(6);
    expect(six.segments![0].change).toBeNull();
    const zones = await getTrendView("zones13", dayAt(150), "m", 0, ctxFor(db));
    expect(zones.bars).toHaveLength(4);
    expect(zones.caption).toBe("Avg. weekly total");
    const sum = zones.breakdown!.items.reduce((a, i) => a + i.value, 0);
    expect(sum).toBeCloseTo(zones.value!, 6);
  });

  it("breakdown days add up to the days with a value", async () => {
    const vm = await getTrendView("consistency", dayAt(150), "m", 0, ctxFor(db));
    const days = vm.bars.filter((b) => b.value !== null).length;
    expect(vm.breakdown!.items.reduce((a, i) => a + i.value, 0)).toBe(days);
  });

  it("time in bed carries bed and wake; the flagged sleep stress is not a key", async () => {
    const vm = await getTrendView("time_in_bed", dayAt(150), "w", 0, ctxFor(db));
    const last = vm.bars.at(-1)!;
    expect(last.parts!.bed).toBeLessThan(last.parts!.wake);
    expect(isTrendViewKey("sleep_stress")).toBe(false);
  });
});
