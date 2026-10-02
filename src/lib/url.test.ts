import { describe, expect, it } from "vitest";
import { dayHref, parentHref, parseDay, parseRange, tabForPath, todayIn, weekOf, withParam } from "./url";

const today = "2026-10-02";

describe("parseDay", () => {
  it("parses a past day", () => {
    expect(parseDay("2026-09-26", today)).toEqual({ d: "2026-09-26", isToday: false, rejected: false });
  });
  it("defaults to today", () => {
    expect(parseDay(undefined, today)).toEqual({ d: today, isToday: true, rejected: false });
    expect(parseDay("", today).d).toBe(today);
  });
  it("rejects future, malformed and impossible dates", () => {
    for (const raw of ["2026-10-03", "2027-01-01", "yesterday", "2026-9-1", "2026-02-31"]) {
      expect(parseDay(raw, today)).toEqual({ d: today, isToday: true, rejected: true });
    }
  });
  it("takes the first of repeated params", () => {
    expect(parseDay(["2026-09-01", "2026-09-02"], today).d).toBe("2026-09-01");
  });
});

describe("dayHref", () => {
  it("carries d into detail links", () => {
    expect(dayHref("/recovery", "2026-09-26", today)).toBe("/recovery?d=2026-09-26");
  });
  it("omits d for today", () => {
    expect(dayHref("/recovery", today, today)).toBe("/recovery");
    expect(dayHref("/recovery?d=2026-09-01", today, today)).toBe("/recovery");
  });
  it("keeps other params and the hash", () => {
    expect(dayHref("/sleep#planner", "2026-09-26", today)).toBe("/sleep?d=2026-09-26#planner");
    expect(dayHref("/strain?r=w", "2026-09-26", today)).toBe("/strain?r=w&d=2026-09-26");
  });
});

describe("other URL state", () => {
  it("range defaults to m", () => {
    expect(parseRange("w")).toBe("w");
    expect(parseRange("6m")).toBe("6m");
    expect(parseRange("year")).toBe("m");
    expect(parseRange(undefined)).toBe("m");
  });
  it("withParam sets and removes", () => {
    expect(withParam("d=2026-09-01&r=w", "d", null)).toBe("?r=w");
    expect(withParam("", "r", "6m")).toBe("?r=6m");
    expect(withParam("?r=w", "r", null)).toBe("");
  });
  it("maps routes to tabs and parents", () => {
    expect(tabForPath("/")).toBe("home");
    expect(tabForPath("/activity/abc")).toBe("home");
    expect(tabForPath("/reports/2026-W39")).toBe("home");
    expect(tabForPath("/health/monitor")).toBe("health");
    expect(tabForPath("/journal/insights")).toBe("journal");
    expect(tabForPath("/settings")).toBe("more");
    expect(parentHref("/health/stress")).toBe("/health");
    expect(parentHref("/recovery")).toBe("/");
  });
  it("weeks run Monday to Sunday", () => {
    expect(weekOf("2026-10-01")).toEqual(["2026-09-28", "2026-10-04"]);
  });
  it("today is computed in the user's zone", () => {
    const at = new Date("2026-10-01T20:00:00Z"); // 01:30 on Oct 2 in Kolkata
    expect(todayIn("Asia/Kolkata", at)).toBe("2026-10-02");
    expect(todayIn("UTC", at)).toBe("2026-10-01");
  });
});
