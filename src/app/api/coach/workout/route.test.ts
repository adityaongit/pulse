// POST /api/coach/workout: the same gate as the chat, and a take for this user's workout only.
import { beforeAll, beforeEach, expect, it, vi } from "vitest";
import { parseConfig, type Config } from "@/server/config";
import { saveProvider, setCoachMode, setConsent } from "@/server/coach/store";
import { type Db, rows, sql } from "@/server/db";
import { profile } from "@/server/db/schema";
import { addUser, seeded, TZ, USER } from "@/server/testing";
import { POST } from "./route";

const h = vi.hoisted(() => ({ cfg: undefined as unknown, user: null as unknown, db: undefined as unknown }));
vi.mock("@/server/config", async (orig) => ({ ...(await orig<object>()), getConfig: () => h.cfg as Config }));
vi.mock("@/server/auth", async (orig) => ({ ...(await orig<object>()), requestUser: async () => h.user }));
vi.mock("@/server/db", async (orig) => ({ ...(await orig<object>()), getDb: () => h.db as Db }));

const as = (userId: number) => (h.user = { userId, email: "x@pulse.test", name: "X", username: null, image: null });
const post = (b: unknown) => POST(new Request("http://localhost/api/coach/workout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }));

let db: Db;
let run: string;
beforeAll(async () => {
  h.cfg = parseConfig({ DATA_SOURCE: "google", GOOGLE_CLIENT_ID: "c", GOOGLE_CLIENT_SECRET: "s", BETTER_AUTH_SECRET: "x".repeat(32), COACH_MOCK: "true" });
  db = h.db = await seeded();
  await db.insert(profile).values({ userId: USER, birthDate: "1990-01-01", sex: "male", timeZone: TZ, updatedAt: 0 });
  [{ id: run }] = await rows<{ id: string }>(db, sql`select id from exercises where user_id = ${USER} and type = 'RUNNING' order by start_ts desc limit 1`);
});
beforeEach(() => as(USER));

it("is gated like the chat, answers in one line for the user's own workout, and 404s another's", async () => {
  h.user = null;
  expect((await post({ id: run })).status).toBe(401);
  as(USER);
  expect((await post({ id: run })).status).toBe(404);
  await setCoachMode(db, "everyone");
  await setConsent(db, USER, true);
  await saveProvider(db, USER, "mock", "mock", null);
  expect((await post({ nope: 1 })).status).toBe(400);
  const r = await post({ id: run });
  expect(r.status, JSON.stringify(await r.clone().json())).toBe(200);
  expect(await r.json()).toEqual({ text: "ok" });

  const other = await addUser(db, "other@pulse.test");
  await db.insert(profile).values({ userId: other, birthDate: "1990-01-01", sex: "female", timeZone: TZ, updatedAt: 0 });
  await setConsent(db, other, true);
  await saveProvider(db, other, "mock", "mock", null);
  as(other);
  expect((await post({ id: run })).status).toBe(404);
});
