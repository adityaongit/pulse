import { describe, expect, it } from "vitest";
import { agoShort, dayLabel, dialAriaLabel, durationWords, formatValue, rangeLabel } from "./format";

describe("format", () => {
  it("shortens sync ages for the header", () => {
    const now = Date.parse("2026-10-02T12:00:00Z");
    expect(agoShort(now - 30_000, now)).toBe("Now");
    expect(agoShort(now - 12 * 60_000, now)).toBe("12m");
    expect(agoShort(now - 3 * 3600_000, now)).toBe("3h");
    expect(agoShort(now - 50 * 3600_000, now)).toBe("2d");
  });
  it("uses the real minus sign and signs deltas", () => {
    expect(formatValue("signed1", -0.6)).toBe("−0.6");
    expect(formatValue("signed1", 0.4)).toBe("+0.4");
    expect(formatValue("signed1", -0.01)).toBe("0.0");
    expect(formatValue("signedInt", -3)).toBe("−3");
  });
  it("formats durations, groups and missing values", () => {
    expect(formatValue("duration", 389)).toBe("6:29");
    expect(formatValue("durationHMS", 1360)).toBe("0:22:40");
    expect(formatValue("grouped", 12459)).toBe("12,459");
    expect(formatValue("int", null)).toBe("--");
    expect(formatValue("int", Number.NaN)).toBe("--");
    expect(durationWords(72)).toBe("1 hour 12 minutes");
  });
  it("labels days and ranges", () => {
    expect(dayLabel("2026-10-02", "2026-10-02")).toBe("Today");
    expect(dayLabel("2026-10-01", "2026-10-02")).toBe("Yesterday");
    expect(dayLabel("2026-09-28", "2026-10-02")).toBe("Mon, Sep 28");
    expect(rangeLabel("2026-09-22", "2026-09-28")).toBe("Sep 22 - Sep 28");
  });
  it("builds dial labels", () => {
    expect(dialAriaLabel({ variant: "recovery", label: "Recovery", value: 72, valueText: "72", unit: "%", bandWord: "Green" })).toBe(
      "Recovery 72 percent, green",
    );
    expect(dialAriaLabel({ variant: "strain", label: "Strain", value: 9.4, valueText: "9.4", target: [12, 15], soFar: true })).toBe(
      "Strain 9.4 of 21 so far, target 12.0 to 15.0",
    );
    expect(dialAriaLabel({ variant: "recovery", label: "Recovery", value: null, reasonText: "Calibrating: 4 nights left" })).toBe(
      "Recovery unavailable: calibrating, 4 nights left",
    );
  });
});
