import { describe, expect, it } from "vitest";
import { daytimeHRCfg, foldHistory } from "./baselines";
import {
  analyze,
  baselineRelativeHighMarginBPM,
  bucketSeconds,
  dayDaytimeAggregate,
  foldDaytimeBaseline,
  highBandFloor,
  marginToSigma,
  minHourHrSamples,
  type ScoringMode,
  scoringMode,
  squash,
} from "./stressBase";
import type { HrSample } from "./types";

/** One local hour of `n` 1 Hz samples at `bpm`, on day `dayIndex` (UTC). */
const hourHr = (hour: number, bpm: number, n = minHourHrSamples, dayIndex = 0): HrSample[] =>
  Array.from({ length: n }, (_, i) => ({ ts: dayIndex * 86_400 + hour * 3_600 + i, bpm }));
const hours = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const flatDayHr = (dayIndex: number, bpm: number) => hours(8, 17).flatMap((h) => hourHr(h, bpm, minHourHrSamples, dayIndex));
const levelAt = (r: ReturnType<typeof analyze>, hour: number) => r.hours.find((p) => p.hour === hour)?.level;
/** 20 days at 65 bpm fold to a personal daytime-HR baseline of exactly 65. */
const baselineRelative65 = (): ScoringMode => ({ kind: "baselineRelative", hr: foldHistory(Array(20).fill(65), daytimeHRCfg) });

describe("DaytimeStressTest (HR-only)", () => {
  it("hourly levels match the Swift twin oracle", () => {
    // noop's oracle also carries R-R, but at a constant RMSSD every hour, whose zero spread drops the term.
    const hr = hours(7, 11).flatMap((h) => hourHr(h, 60 + (h - 7) * 4));
    const r = analyze(hr);
    expect(r.hours.map((p) => `${p.startTs}:${p.level!.toFixed(6)}`).join(" ")).toBe(
      "25200:0.990715 28800:1.500000 32400:2.009285 36000:2.413289 39600:2.678875",
    );
    expect(r.highStressMinutes).toBe(180);
    expect(r.sustainedHigh).toBe(true);
    expect(r.sustainedRun).toBe(3);
    expect(r.peak?.startTs).toBe(39600);
  });

  it("sleep hours in the window do not shift the waking timeline", () => {
    const wakingBpm = [62, 64, 63, 65, 64, 63, 62, 64, 66, 63, 64, 65];
    const waking = hours(6, 17).flatMap((h, i) => hourHr(h, wakingBpm[i]));
    const sleep = hours(0, 5).flatMap((h, i) => hourHr(h, [50, 51, 52, 51, 50, 53][i]));
    const wakingOnly = analyze(waking);
    const withSleep = analyze([...sleep, ...waking]);
    expect(withSleep.sustainedHigh).toBe(wakingOnly.sustainedHigh);
    for (const h of hours(6, 17)) {
      expect(levelAt(withSleep, h)).not.toBeNull();
      expect(levelAt(withSleep, h)).toBeCloseTo(levelAt(wakingOnly, h)!, 9);
    }
    expect(withSleep.sustainedHigh).toBe(false);
  });

  it("dayRelative default equals the explicit mode", () => {
    const hr = [...[8, 9, 10].flatMap((h) => hourHr(h, 58)), ...hourHr(13, 120), ...hourHr(14, 125), ...hourHr(15, 130)];
    expect(analyze(hr, 3_600)).toEqual(analyze(hr, 3_600, { kind: "dayRelative" }));
  });

  it("highStressMinutes counts every high hour, not just the trailing run", () => {
    const hr = [...hourHr(7, 130), ...[8, 9, 10, 11].flatMap((h) => hourHr(h, 60))];
    const r = analyze(hr);
    expect(r.sustainedHigh).toBe(false);
    const highHours = r.hours.filter((p) => p.level! >= highBandFloor).length;
    expect(highHours).toBeGreaterThan(0);
    expect(r.highStressMinutes).toBe(highHours * (bucketSeconds / 60));
  });

  it("an under-gate hour is listed but unscored", () => {
    const r = analyze([...hourHr(9, 70), ...hourHr(10, 70, minHourHrSamples - 1)]);
    expect(levelAt(r, 10)).toBeNull();
    expect(r.hours.find((p) => p.hour === 10)?.meanHr).toBeNull();
  });

  it("marginToSigma lands exactly on the band", () => {
    const sd = marginToSigma(baselineRelativeHighMarginBPM, highBandFloor);
    expect(squash(baselineRelativeHighMarginBPM / sd)).toBeCloseTo(highBandFloor, 9);
  });

  it("baselineRelative recovers multiple injected elevations", () => {
    const mode = baselineRelative65();
    expect(mode.kind === "baselineRelative" && mode.hr.baseline).toBeCloseTo(65, 6);
    const levels: [number, number][] = [
      [8, 65],
      [10, 72],
      [13, 80],
      [16, 95],
    ];
    const r = analyze(levels.flatMap(([h, bpm]) => hourHr(h, bpm)), 0, mode);
    const scores = levels.map(([h]) => levelAt(r, h)!);
    for (let i = 1; i < scores.length; i++) expect(scores[i]).toBeGreaterThan(scores[i - 1]);
    expect(scores[0]).toBeCloseTo(1.5, 1);
    expect(Math.abs(scores[2] - highBandFloor)).toBeLessThan(0.01);
    expect(scores[3]).toBeGreaterThan(highBandFloor);
  });

  it("baselineRelative calm day at the personal baseline reads 1.5", () => {
    const r = analyze([8, 10, 13, 16].flatMap((h) => hourHr(h, 65)), 0, baselineRelative65());
    for (const p of r.hours) expect(Math.abs(p.level! - 1.5)).toBeLessThan(0.05);
    expect(r.highStressMinutes).toBe(0);
    expect(r.sustainedHigh).toBe(false);
  });

  it("baselineRelative elevated day produces high-stress minutes", () => {
    const r = analyze(hours(8, 16).flatMap((h) => hourHr(h, 95)), 0, baselineRelative65());
    expect(r.highStressMinutes).toBeGreaterThan(0);
    for (const p of r.hours) expect(p.level!).toBeGreaterThanOrEqual(highBandFloor);
  });

  it("empty HR is the empty read", () => {
    expect(analyze([])).toEqual({ hours: [], sustainedHigh: false, sustainedRun: 0, dayMean: null, peak: null, highStressMinutes: 0 });
  });
});

describe("DaytimeBaselinesTest (HR-only)", () => {
  const spread = [60, 62, 64, 66, 68, 70, 72, 74, 76, 78];
  const spreadDay = () => hours(8, 17).flatMap((h, i) => hourHr(h, spread[i]));

  it("day aggregate is P10 of waking-hour mean HRs", () => {
    expect(dayDaytimeAggregate(spreadDay())).toBeCloseTo(61.8, 6);
  });

  it("day aggregate applies the scorer's min-samples gate", () => {
    const withSparse = dayDaytimeAggregate([...spreadDay(), ...hourHr(7, 40, minHourHrSamples - 1)]);
    expect(withSparse).toBeCloseTo(dayDaytimeAggregate(spreadDay())!, 9);
  });

  it("day aggregate excludes non-waking hours", () => {
    expect(dayDaytimeAggregate([...spreadDay(), ...hourHr(3, 45)])).toBeCloseTo(61.8, 6);
  });

  it("fold converges to the personal daytime floor", () => {
    const b = foldDaytimeBaseline(hours(0, 11).map((d) => dayDaytimeAggregate(flatDayHr(d, 65))));
    expect(b.baseline).toBeCloseTo(65, 6);
    expect(b.status === "provisional" || b.status === "trusted").toBe(true);
  });

  it("scoringMode falls back to dayRelative on cold start and sparse history", () => {
    expect(scoringMode([]).kind).toBe("dayRelative");
    expect(scoringMode(hours(0, 2).map((d) => dayDaytimeAggregate(flatDayHr(d, 65)))).kind).toBe("dayRelative");
  });

  it("scoringMode uses baselineRelative once history is usable", () => {
    const mode = scoringMode(hours(0, 5).map((d) => dayDaytimeAggregate(flatDayHr(d, 65))));
    expect(mode.kind).toBe("baselineRelative");
    if (mode.kind === "baselineRelative") expect(mode.hr.baseline).toBeCloseTo(65, 6);
  });

  it("folded baseline scores an all-day elevation against the personal floor", () => {
    const mode = scoringMode(hours(0, 19).map((d) => dayDaytimeAggregate(flatDayHr(d, 65))));
    expect(mode.kind).toBe("baselineRelative");
    const r = analyze(flatDayHr(0, 80), 0, mode);
    expect(r.hours.length).toBeGreaterThan(0);
    expect(r.highStressMinutes).toBeGreaterThan(0);
    for (const p of r.hours) expect(p.level!).toBeGreaterThanOrEqual(highBandFloor - 0.05);
  });

  it("folded baseline calm day at the floor reads neutral", () => {
    const mode = scoringMode(hours(0, 19).map((d) => dayDaytimeAggregate(flatDayHr(d, 65))));
    const r = analyze(flatDayHr(0, 65), 0, mode);
    expect(r.highStressMinutes).toBe(0);
    for (const p of r.hours) expect(Math.abs(p.level! - 1.5)).toBeLessThan(0.05);
  });

  it("an empty day reduces to nothing", () => {
    expect(dayDaytimeAggregate([])).toBeNull();
  });
});
