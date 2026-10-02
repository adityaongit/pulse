import { describe, expect, it } from "vitest";
import { defaultLowerBounds, secondsInZone, timeInZone, totalSeconds, zoneNumber, zones, zonesForAge } from "./zones";

describe("HrZonesTest", () => {
  it("a huge positive gap is capped at the median interval", () => {
    const tiz = timeInZone(
      [
        { ts: 0, bpm: 110 },
        { ts: 1, bpm: 110 },
        { ts: 2, bpm: 110 },
        { ts: 3602, bpm: 110 },
      ],
      zones(200),
    );
    expect(totalSeconds(tiz)).toBeLessThan(10);
    expect(secondsInZone(tiz, 1)).toBeCloseTo(totalSeconds(tiz), 9);
  });

  it("custom BPM boundaries replace percentage edges", () => {
    const zs = zones(200, "manual", [95, 118, 142, 168, 184]);
    expect(zs.source).toBe("custom");
    expect(zs.zones.map((z) => z.lower)).toEqual([95, 118, 142, 168, 184]);
    expect([117, 118, 168, 184, 230].map((b) => zoneNumber(zs, b))).toEqual([1, 2, 4, 5, 5]);
  });

  it("invalid custom boundaries fall back to defaults", () => {
    const zs = zones(200, "manual", [100, 120, 120, 160, 180]);
    expect(zs.source).toBe("manual");
    expect(zs.zones.map((z) => z.lower)).toEqual([100, 120, 140, 160, 180]);
  });

  it("default editor bounds preserve integer classification", () => {
    expect(defaultLowerBounds(187)).toEqual([94, 113, 131, 150, 169]);
  });
});

describe("zones", () => {
  it("Tanaka from age, or a manual override", () => {
    expect(zonesForAge(30)).toMatchObject({ maxHR: 187, source: "tanaka" });
    expect(zonesForAge(30, 190)).toMatchObject({ maxHR: 190, source: "manual" });
  });

  it("buckets a constant-rate stream fully, top zone inclusive at HRmax", () => {
    const zs = zones(200);
    expect([99, 100, 119, 120, 180, 200, 210].map((b) => zoneNumber(zs, b))).toEqual([0, 1, 1, 2, 5, 5, 5]);
    const hr = [...Array(60)].map((_, i) => ({ ts: i * 2, bpm: i < 30 ? 90 : 150 }));
    const tiz = timeInZone(hr, zs);
    expect(tiz.belowZone1).toBe(60);
    expect(secondsInZone(tiz, 3)).toBe(60); // 150 / 200 = 75%
    expect(totalSeconds(tiz)).toBe(120);
    expect(secondsInZone(tiz, 9)).toBe(0);
  });
});
