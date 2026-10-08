import { describe, expect, it } from "vitest";
import { behaviorChips, type BehaviorDay } from "./behaviorChips";

const AS_OF = "2026-04-30";
const day = (i: number) => new Date(Date.UTC(2026, 3, 30 - i)).toISOString().slice(0, 10);

/** 40 behaviour days before AS_OF, alternating with and without `sleep86`; Recovery the day after follows `effect`. */
function history(effect: number, holdsYesterday = true) {
  const days: BehaviorDay[] = [];
  const recovery: { day: string; recovery: number | null }[] = [];
  for (let i = 1; i <= 40; i++) {
    const on = i === 1 ? holdsYesterday : i % 2 === 0;
    days.push({ day: day(i), holds: { sleep86: on, strain7: i % 3 === 0 } });
    recovery.push({ day: day(i - 1), recovery: 60 + (on ? effect : 0) + (i % 5) });
  }
  return { days, recovery };
}

describe("behaviorChips", () => {
  it("lists only what held yesterday, in a fixed order", () => {
    const h = history(0);
    h.days[0].holds = { consistentWake: true, sleep86: true, strain7: false };
    expect(behaviorChips(h.days, h.recovery, AS_OF).map((c) => c.key)).toEqual(["sleep86", "consistentWake"]);
  });

  it("tones a clear next-day Recovery effect up or down, else neutral", () => {
    const up = history(12);
    expect(behaviorChips(up.days, up.recovery, AS_OF)[0]).toEqual({ key: "sleep86", label: "86%+ Sleep Performance", effect: "up" });
    const down = history(-12);
    expect(behaviorChips(down.days, down.recovery, AS_OF)[0].effect).toBe("down");
    const flat = history(0);
    expect(behaviorChips(flat.days, flat.recovery, AS_OF)[0].effect).toBe("neutral");
  });

  it("returns nothing without a day before", () => {
    const h = history(12);
    expect(behaviorChips(h.days.slice(1), h.recovery, AS_OF)).toEqual([]);
  });
});
