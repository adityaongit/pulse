import { describe, expect, it } from "vitest";
import { normalizeReason, REASON_CODES, REASONS, reasonCopy, TAG_COPY } from "./reasons";

describe("reasons", () => {
  it("every code has short and long copy, and every code but no_data an icon", () => {
    for (const code of REASON_CODES) {
      const r = reasonCopy(code, 3);
      expect(r.short.length).toBeGreaterThan(0);
      expect(r.long.length).toBeGreaterThan(0);
      if (code !== "no_data") expect(REASONS[code].icon).toBeTruthy();
    }
  });
  it("unknown and missing codes fall back to no_data", () => {
    expect(normalizeReason("battery_low")).toBe("no_data");
    expect(normalizeReason(null)).toBe("no_data");
    expect(normalizeReason(undefined)).toBe("no_data");
    expect(reasonCopy("nope")).toMatchObject({ code: "no_data", short: "--", long: "No data", icon: null });
  });
  it("calibrating counts nights", () => {
    expect(reasonCopy("calibrating", 4).long).toBe("Calibrating: 4 nights left");
    expect(reasonCopy("calibrating", 1).long).toBe("Calibrating: 1 night left");
  });
  it("spec copy", () => {
    expect(reasonCopy("no_hrv_last_night").long).toBe("No HRV last night (needs about 3 h of sleep)");
    expect(reasonCopy("awaiting_sleep_sync").long).toBe("Waiting for last night's sleep to sync");
    expect(reasonCopy("insufficient_hr_data").long).toBe("Not enough heart-rate data");
    expect(reasonCopy("band_not_worn").long).toBe("No data: band not worn");
    expect(TAG_COPY.stale_baseline.label).toBe("Baseline stale");
  });
});
