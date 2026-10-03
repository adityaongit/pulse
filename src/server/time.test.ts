import { describe, expect, it } from "vitest";
import { fractionalYears, wholeYears } from "./time";

describe("age", () => {
  it("whole years tick over on the birthday, not the day after", () => {
    expect(wholeYears("1990-06-15", "2026-06-14")).toBe(35);
    expect(wholeYears("1990-06-15", "2026-06-15")).toBe(36);
    expect(wholeYears("1990-06-15", "2026-12-31")).toBe(36);
    expect(wholeYears("1990-01-01", "1990-01-01")).toBe(0);
  });

  it("fractional years are exact on a birthday and floor to whole years every day", () => {
    expect(fractionalYears("1990-06-15", "2026-06-15")).toBe(36);
    expect(fractionalYears("1990-06-15", "2026-06-14")).toBeGreaterThan(35.99);
    expect(fractionalYears("1990-06-15", "2026-06-14")).toBeLessThan(36);
    expect(fractionalYears("1990-01-01", "1990-07-02")).toBeCloseTo(182 / 365, 12);
    for (let i = 0; i < 3 * 366; i++) {
      const day = new Date(Date.UTC(2025, 0, 1) + i * 86_400_000).toISOString().slice(0, 10);
      for (const birth of ["1990-06-15", "1992-02-29", "1985-12-31"]) {
        expect(Math.floor(fractionalYears(birth, day)), `${birth} on ${day}`).toBe(wholeYears(birth, day));
      }
    }
  });

  it("a Feb 29 birth date turns over on Mar 1 in common years and on Feb 29 in leap years", () => {
    expect(wholeYears("1992-02-29", "2026-02-28")).toBe(33);
    expect(wholeYears("1992-02-29", "2026-03-01")).toBe(34);
    expect(wholeYears("1992-02-29", "2028-02-28")).toBe(35);
    expect(wholeYears("1992-02-29", "2028-02-29")).toBe(36);
    expect(fractionalYears("1992-02-29", "2026-03-01")).toBe(34);
    expect(fractionalYears("1992-02-29", "2028-02-29")).toBe(36);
    expect(fractionalYears("1992-02-29", "2026-02-28")).toBeLessThan(34);
  });
});
