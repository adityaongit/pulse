import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Db } from "@/server/db";
import { journalEntries, journalNotes, oauthTokens } from "@/server/db/schema";
import { toCsv } from "@/server/export";
import { addTag } from "@/server/journalTags";
import { saveProfile } from "@/server/profile";
import { addUser, seeded, TZ, USER } from "@/server/testing";
import { GET as daily } from "./daily/route";
import { GET as journal } from "./journal/route";

const h = vi.hoisted(() => ({ db: undefined as unknown, user: null as unknown }));
vi.mock("@/server/db", async (orig) => ({ ...(await orig<object>()), getDb: () => h.db as Db }));
vi.mock("@/server/auth", async (orig) => ({ ...(await orig<object>()), requestUser: async () => h.user }));

const SECRETS = ["at-SECRET-access", "rt-SECRET-refresh"];
const OTHER_LABEL = "Other-user-SECRET-label";

let db: Db;
const ME = { userId: USER, email: "me@example.com", name: "Me", username: "me", image: null };
const req = (url: string, signedIn = true) => {
  h.user = signedIn ? ME : null;
  return new NextRequest(`http://pulse:3000${url}`);
};
const noSecrets = (text: string) => {
  for (const s of [...SECRETS, OTHER_LABEL]) expect(text).not.toContain(s);
};

beforeAll(async () => {
  db = h.db = await seeded();
  await db.insert(oauthTokens).values({ userId: USER, accessToken: SECRETS[0], refreshToken: SECRETS[1], expiresAt: 1, scope: "s", updatedAt: 1 });
  await saveProfile(db, USER, { birthDate: "1990-01-01", sex: "male", maxHr: null, heightCm: null, timeZone: TZ });
  await addTag(db, USER, "=cmd", "=HYPERLINK(\"x\")");
  await db.insert(journalEntries).values({ userId: USER, day: "2026-10-01", tag: "=cmd", value: 1 });
  const other = await addUser(db);
  await addTag(db, other, "other_tag", OTHER_LABEL);
  await db.insert(journalEntries).values({ userId: other, day: "2026-10-01", tag: "other_tag", value: 1 });
  await db.insert(journalNotes).values([{ userId: USER, day: "2026-10-01", text: "Mine" }, { userId: other, day: "2026-10-01", text: "Theirs" }]);
});

describe("/export/daily and /export/journal", () => {
  it("refuse a request without a session (401), whatever the proxy did", async () => {
    for (const handler of [daily, journal]) expect((await handler(req("/export/x?format=csv", false))).status).toBe(401);
  });

  it("daily CSV: an attachment, one row per day, the documented columns, no secrets", async () => {
    const res = await daily(req("/export/daily?format=csv"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="pulse-daily-\d{4}-\d{2}-\d{2}\.csv"$/);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const text = await res.text();
    const lines = text.trimEnd().split("\r\n");
    expect(lines[0]).toBe(
      "day,recovery_pct,strain,sleep_performance_pct,sleep_minutes,sleep_consistency_pct,hrv_ms,resting_hr_bpm,respiratory_rate_rpm,spo2_pct,skin_temperature_deviation_c,stress_avg,steps,weight_kg,body_fat_pct," +
        "distance_km,floors,elevation_m,active_minutes,light_minutes,azm_minutes,active_calories_kcal,sedentary_minutes,avg_hr_bpm," +
        "water_ml,calories_in_kcal,protein_g,carbs_g,fat_g,glucose_mg_dl,core_temp_c,swim_strokes",
    );
    const head = lines[0].split(",");
    const seededDay = lines.find((l) => l.startsWith("2026-10-01,"))!.split(",");
    expect(seededDay[head.indexOf("distance_km")]).toMatch(/^\d+\.\d{1,2}$/);
    expect(seededDay[head.indexOf("water_ml")]).toBe("");
    expect(lines.length).toBeGreaterThanOrEqual(181);
    expect(lines[1]).toMatch(/^\d{4}-\d{2}-\d{2},/);
    noSecrets(text);
  });

  it("daily JSON and a bad format", async () => {
    const res = await daily(req("/export/daily?format=json"));
    const body = (await res.json()) as { timeZone: string; days: Record<string, unknown>[] };
    expect(res.headers.get("content-disposition")).toMatch(/\.json"$/);
    expect(body.timeZone).toBe("Asia/Kolkata");
    expect(Object.keys(body.days[0])).toContain("hrv_ms");
    expect((await daily(req("/export/daily?format=xml"))).status).toBe(400);
  });

  it("journal CSV defuses formulas in user labels; the JSON lists behaviours; no secrets", async () => {
    const csv = await (await journal(req("/export/journal?format=csv"))).text();
    expect(csv.split("\r\n")[0]).toBe("day,behaviour,label,answer,follow_up");
    expect(csv).toContain(`2026-10-01,'=cmd,"'=HYPERLINK(""x"")",1,`);
    noSecrets(csv);
    const json = (await (await journal(req("/export/journal?format=json"))).json()) as { behaviours: { tag: string; custom: boolean }[]; entries: unknown[]; notes: unknown[] };
    expect(json.notes).toEqual([{ day: "2026-10-01", text: "Mine" }]);
    expect(json.behaviours.find((b) => b.tag === "alcohol")).toMatchObject({ custom: false });
    expect(json.entries.length).toBeGreaterThan(100);
    noSecrets(JSON.stringify(json));
  });
});

describe("toCsv", () => {
  it("quotes commas, quotes and newlines, and leaves numbers and nulls plain", () => {
    expect(toCsv({ columns: ["a", "b"], rows: [["x,y", 'say "hi"'], [1.5, null], ["-1", "line\nbreak"]] })).toBe(
      'a,b\r\n"x,y","say ""hi"""\r\n1.5,\r\n\'-1,"line\nbreak"\r\n'
    );
  });
});
