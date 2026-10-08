import { beforeAll, beforeEach, expect, it, vi } from "vitest";
import { asc, eq } from "drizzle-orm";
import type { Db } from "../db";
import { dashboardMetrics, hrDays } from "../db/schema";
import { dashboardKeys } from "../queries/home";
import { addUser, freshDb, USER } from "../testing";
import { saveDashboard } from "./dashboard";

const ME = { userId: USER, email: "me@example.com", name: "Me", username: "me", image: null };
const h = vi.hoisted(() => ({ db: undefined as unknown, revalidate: vi.fn(), user: null as unknown }));
vi.mock("../auth", async (orig) => ({ ...(await orig<object>()), currentUser: async () => h.user }));
vi.mock("next/cache", () => ({ revalidatePath: h.revalidate }));
vi.mock("../db", async (orig) => ({ ...(await orig<object>()), getDb: () => h.db as Db }));

let db: Db;
let other: number;
const rows = (userId = USER) =>
  db.select({ key: dashboardMetrics.key, position: dashboardMetrics.position }).from(dashboardMetrics).where(eq(dashboardMetrics.userId, userId)).orderBy(asc(dashboardMetrics.position));

beforeAll(async () => {
  db = h.db = await freshDb();
  other = await addUser(db);
});
beforeEach(async () => {
  await db.delete(dashboardMetrics);
  h.revalidate.mockClear();
  h.user = ME;
});

it("signed out, a save is refused and nothing is stored", async () => {
  h.user = null;
  expect(await saveDashboard({ keys: ["steps"] })).toEqual({ ok: false, error: "Signed out. Sign in again." });
  expect(await rows()).toEqual([]);
  expect(h.revalidate).not.toHaveBeenCalled();
});

it("saves the chosen metrics in order for that user only, and revalidates Home", async () => {
  await db.insert(dashboardMetrics).values({ userId: other, key: "hrv", position: 0 });
  expect(await saveDashboard({ keys: ["steps", "hrv", "sleep"] })).toEqual({ ok: true, data: undefined });
  expect(await rows()).toEqual([
    { key: "steps", position: 0 },
    { key: "hrv", position: 1 },
    { key: "sleep", position: 2 },
  ]);
  expect(await dashboardKeys(db, USER)).toEqual(["steps", "hrv", "sleep"]);
  expect(await rows(other)).toEqual([{ key: "hrv", position: 0 }]);
  expect(h.revalidate).toHaveBeenCalledWith("/");
});

it("rejects unknown, repeated or no metrics, writing nothing", async () => {
  await saveDashboard({ keys: ["hrv"] });
  for (const keys of [["hrv", "not_a_metric"], ["hrv", "hrv"], [], ["__proto__"]]) expect(await saveDashboard({ keys })).toMatchObject({ ok: false });
  expect(await rows()).toEqual([{ key: "hrv", position: 0 }]);
});

it("the default list is stored as no rows: phone metrics until heart rate syncs, then the reference app's rows", async () => {
  await saveDashboard({ keys: ["steps"] });
  await saveDashboard({ keys: ["steps", "distance", "calories", "active_minutes", "active_calories", "floors"] });
  expect(await rows()).toEqual([]);
  await db.insert(hrDays).values({ userId: USER, bucket: 0, offsets: [1], values: [60] });
  try {
    await saveDashboard({ keys: ["hrv", "sleep", "consistency", "hours", "stress", "rhr", "vo2max", "steps"] });
    expect(await rows()).toEqual([]);
  } finally {
    await db.delete(hrDays);
  }
});
