import { describe, expect, it } from "vitest";
import { fieldPaths, medianGapSeconds } from "./probe";

const hr = (t: string, bpm: string) => ({
  dataSource: { platform: "FITBIT" },
  heartRate: { beatsPerMinute: bpm, sampleTime: { physicalTime: t } },
});

describe("probe", () => {
  it("fieldPaths lists paths and JSON types, never values", () => {
    const points = [hr("2026-09-10T00:00:00Z", "61"), { sleep: { stages: [{ type: "DEEP" }] } }];
    const paths = fieldPaths(points);
    expect(paths).toEqual([
      "dataSource.platform  string",
      "heartRate.beatsPerMinute  string",
      "heartRate.sampleTime.physicalTime  string",
      "sleep.stages  array",
      "sleep.stages[].type  string",
    ]);
    expect(paths.join("\n")).not.toMatch(/61|DEEP|2026/);
  });

  it("medianGapSeconds reads sample or interval times, in any order", () => {
    const pts = ["00:00:04", "00:00:00", "00:00:02", "00:00:10"].map((t) => hr(`2026-09-10T${t}Z`, "60"));
    expect(medianGapSeconds(pts)).toBe(2);
    expect(medianGapSeconds([{ steps: { interval: { startTime: "2026-09-10T00:00:00Z" } } }])).toBeNull();
    expect(medianGapSeconds([])).toBeNull();
  });
});
