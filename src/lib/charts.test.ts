import { describe, expect, it } from "vitest";
import { clockTicks, hourTicks, hypnogramSeries, markerSlices, ringRadii, splitByBand, targetSlices } from "./charts";

describe("splitByBand", () => {
  it("puts each value in its band and joins segments across a crossing", () => {
    const { rows, keys } = splitByBand(
      [
        { x: 0, y: 0.5 },
        { x: 1, y: 1.5 },
        { x: 2, y: null },
        { x: 3, y: 2.5 },
      ],
      [1, 2],
    );
    expect(keys).toEqual(["b0", "b1", "b2"]);
    expect(rows[0]).toEqual({ x: 0, b0: 0.5, b1: 0.5, b2: null }); // copied into the next point's band
    expect(rows[1]).toEqual({ x: 1, b0: null, b1: 1.5, b2: null }); // next is a gap: no join
    expect(rows[2]).toEqual({ x: 2, b0: null, b1: null, b2: null });
    expect(rows[3]).toEqual({ x: 3, b0: null, b1: null, b2: 2.5 });
  });
  it("bands Energy like Recovery with [34, 67]", () => {
    const { rows } = splitByBand([{ x: 0, y: 33.9 }, { x: 1, y: 67 }], [34, 67]);
    expect(rows[0].b0).toBe(33.9);
    expect(rows[1].b2).toBe(67);
  });
});

describe("hypnogramSeries", () => {
  const segs = [
    { stage: "light" as const, start: 0, end: 10 },
    { stage: "rem" as const, start: 10, end: 20 },
    { stage: "deep" as const, start: 20, end: 30 },
    { stage: "rem" as const, start: 30, end: 40 },
  ];
  it("runs the connector through every start and ends at wake", () => {
    expect(hypnogramSeries(segs).connector).toEqual([
      { t: 0, lane: 1 },
      { t: 10, lane: 2 },
      { t: 20, lane: 0 },
      { t: 30, lane: 2 },
      { t: 40, lane: 2 },
    ]);
  });
  it("never joins two separate blocks of one stage", () => {
    expect(hypnogramSeries(segs).stages.rem).toEqual([
      { t: 10, lane: 2 },
      { t: 20, lane: 2 },
      { t: 20, lane: null },
      { t: 30, lane: 2 },
      { t: 40, lane: 2 },
      { t: 40, lane: null },
    ]);
  });
  it("sorts unordered input", () => {
    expect(hypnogramSeries([...segs].reverse()).connector[0]).toEqual({ t: 0, lane: 1 });
  });
});

describe("hourTicks", () => {
  it("lands on whole local hours in a half-hour zone", () => {
    const bed = Date.UTC(2026, 9, 1, 17, 18); // 22:48 IST
    const wake = Date.UTC(2026, 9, 2, 1, 11); // 06:41 IST
    const ticks = hourTicks(bed, wake, 2, "Asia/Kolkata");
    const fmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Kolkata" });
    expect(ticks.map((t) => fmt.format(t))).toEqual(["00:00", "02:00", "04:00", "06:00"]);
  });
  it("steps in minutes for short windows", () => {
    const start = Date.UTC(2026, 9, 2, 5, 46, 20); // 11:16:20 IST
    const fmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Kolkata" });
    expect(clockTicks(start, start + 58 * 60_000, 15, "Asia/Kolkata").map((t) => fmt.format(t))).toEqual(["11:30", "11:45", "12:00"]);
  });
});

describe("ScoreDial slices", () => {
  it("strain target band covers lo to hi on 0-21", () => {
    expect(targetSlices(12, 15)).toEqual([12, 3, 6]);
    expect(targetSlices(19, 25)).toEqual([19, 2, 0]);
  });
  it("marker slices centre on the value and stay in the domain", () => {
    expect(markerSlices(13.5, 21, 0.2).map((v) => +v.toFixed(2))).toEqual([13.4, 0.2, 7.4]);
    expect(markerSlices(0, 3, 0.06).map((v) => +v.toFixed(2))).toEqual([0, 0.06, 2.94]);
  });
  it("ring radii leave 2 px for the tick", () => {
    expect(ringRadii(96, 6)).toEqual({ outer: "95.8%", inner: "83.3%", tickOuter: "100%", tickInner: "79.2%" });
  });
});
