import { describe, expect, it } from "vitest";
import { openDb } from "./db";
import { getProfile, ProfileInput, saveProfile } from "./profile";
import { seeded } from "./testing";

const input = { birthDate: "1990-06-15", sex: "female", maxHr: null, heightCm: 165 } as const;

describe("profile", () => {
  it("is null before onboarding", () => {
    expect(getProfile(openDb(":memory:"))).toBeNull();
  });

  it("estimates max HR from age (Tanaka) unless measured", () => {
    const db = openDb(":memory:");
    saveProfile(db, input);
    // Age 36 on 2026-10-02: 208 - 0.7 * 36 = 182.8
    expect(getProfile(db, "2026-10-02")).toEqual({ birthDate: "1990-06-15", sex: "female", maxHr: 183, maxHrSet: false, heightCm: 165 });
    // Birthday not reached yet, age 35: 183.5
    expect(getProfile(db, "2026-06-14")!.maxHr).toBe(184);
    saveProfile(db, { ...input, maxHr: 190 });
    expect(getProfile(db)).toMatchObject({ maxHr: 190, maxHrSet: true });
  });

  it("saving a change marks every day for recompute; saving the same values does nothing", () => {
    const db = seeded();
    const days = db.$client.prepare("select count(distinct day) from daily_metrics").pluck().get();
    const dirty = () => db.$client.prepare("select count(*) from intraday_dirty").pluck().get();
    expect(dirty()).toBe(0);
    expect(saveProfile(db, input)).toBe(true);
    expect(dirty()).toBe(days);
    db.$client.prepare("delete from intraday_dirty").run();
    expect(saveProfile(db, input)).toBe(false);
    expect(dirty()).toBe(0);
  });

  it("validates input, coercing form strings", () => {
    expect(ProfileInput.parse({ birthDate: "1990-06-15", sex: "male", maxHr: "185", heightCm: "178.5" })).toEqual({
      birthDate: "1990-06-15",
      sex: "male",
      maxHr: 185,
      heightCm: 178.5,
    });
    for (const bad of [
      { ...input, birthDate: "15/06/1990" },
      { ...input, birthDate: new Date().toISOString().slice(0, 10) },
      { ...input, sex: "x" },
      { ...input, maxHr: 300 },
      { ...input, heightCm: 20 },
    ])
      expect(ProfileInput.safeParse(bad).success).toBe(false);
  });
});
