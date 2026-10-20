// POST /api/mcp: who gets through (a personal access token, nothing else), that a token reaches only its own user's data
// through the coach's own tools, and that the log tools write for that user alone.
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Db } from "@/server/db";
import { loggedEntries, profile } from "@/server/db/schema";
import { coachTools } from "@/server/coach/tools";
import { createToken, revokeToken, listTokens } from "@/server/mcp/tokens";
import { ctxFor, seeded, NOW, TZ, USER, addUser } from "@/server/testing";
import * as route from "./route";

const { POST } = route;

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/worker", () => ({ requestSync: vi.fn() }));

const HEADERS = { "content-type": "application/json", accept: "application/json, text/event-stream" };
const call = (token: string | null, method: string, params?: unknown, id = 1) =>
  POST(new Request("http://localhost/api/mcp", { method: "POST", headers: { ...HEADERS, ...(token && { authorization: `Bearer ${token}` }) }, body: JSON.stringify({ jsonrpc: "2.0", id, method, params }) }));
const tool = async (token: string, name: string, args: object = {}) => {
  const res = await call(token, "tools/call", { name, arguments: args });
  expect(res.status).toBe(200);
  const { result } = (await res.json()) as { result: { isError?: boolean; content: { text: string }[] } };
  return { isError: !!result.isError, text: result.content[0].text, json: result.isError ? null : JSON.parse(result.content[0].text) };
};

let db: Db;
let other: number;
let mine: string;
let theirs: string;
beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"], now: NOW * 1000 });
  db = await seeded();
  await db.insert(profile).values({ userId: USER, birthDate: "1990-01-01", sex: "male", maxHr: 183, timeZone: TZ, updatedAt: 0 }).onConflictDoNothing();
  other = await addUser(db, "other@pulse.test");
  // A woman in New York with no data of her own: nothing of user 1's may show up for her.
  await db.insert(profile).values({ userId: other, birthDate: "1977-07-07", sex: "female", maxHr: 199, timeZone: "America/New_York", updatedAt: 0 });
  mine = await createToken(db, USER, "mine");
  theirs = await createToken(db, other, "theirs");
});
afterAll(() => vi.useRealTimers());

describe("authentication", () => {
  it("refuses a missing, malformed, unknown or revoked token with a 401 JSON-RPC error, before any tool runs", async () => {
    const revoked = await createToken(db, USER, "revoked");
    await revokeToken(db, USER, (await listTokens(db, USER)).find((t) => t.name === "revoked")!.id);
    for (const auth of [undefined, "", "Bearer", "Bearer pulse_unknown", `Bearer ${revoked}`, `Basic ${mine}`, `Bearer ${mine.slice(6)}`, `Bearer ${mine} x`]) {
      const res = await POST(new Request("http://localhost/api/mcp", { method: "POST", headers: { ...HEADERS, ...(auth !== undefined && { authorization: auth }) }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) }));
      expect(res.status, String(auth)).toBe(401);
      expect(res.headers.get("www-authenticate")).toBe("Bearer");
      expect(await res.json()).toMatchObject({ jsonrpc: "2.0", error: { code: -32000 }, id: null });
    }
  });

  it("is POST only: no stream and no session to end, so Next answers GET and DELETE with 405", () => {
    expect(Object.keys(route)).toEqual(["POST"]);
  });

  it("a user whose profile isn't set up yet gets a 409", async () => {
    const bare = await createToken(db, await addUser(db, "bare@pulse.test"), "bare");
    expect((await call(bare, "tools/list")).status).toBe(409);
  });
});

describe("protocol", () => {
  it("initialize names the server and offers tools", async () => {
    const res = await call(mine, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } });
    expect(res.status).toBe(200);
    const { result } = await res.json();
    expect(result).toMatchObject({ serverInfo: { name: "pulse" }, capabilities: { tools: {} } });
    expect(result.instructions).toContain("log_");
  });

  it("lists exactly the coach's tools with the coach's input schemas, so the two cannot drift", async () => {
    const { result } = await (await call(mine, "tools/list")).json();
    const coach = coachTools(ctxFor(db));
    expect(result.tools.map((t: { name: string }) => t.name)).toEqual(Object.keys(coach));
    const day = result.tools.find((t: { name: string }) => t.name === "get_day");
    expect(day.description).toBe(coach.get_day.description);
    expect(day.inputSchema.properties.day.description).toBe("User-local calendar day; omit for today. Future requests resolve to today; check the returned day.");
    expect(day.annotations).toMatchObject({ readOnlyHint: true });
    const water = result.tools.find((t: { name: string }) => t.name === "log_water");
    expect(water.inputSchema).toMatchObject({ required: ["ml"], properties: { ml: { minimum: 10, maximum: 5000 } } });
    expect(water.annotations).toMatchObject({ readOnlyHint: false });
  });

  it("describes the log tools as saving at once: there is no confirmation card on this transport", async () => {
    const { result } = await (await call(mine, "tools/list")).json();
    for (const t of result.tools.filter((t: { name: string }) => t.name.startsWith("log_"))) {
      expect(t.description, t.name).toContain("Saves immediately");
      expect(t.description, t.name).not.toContain("Waits for the user");
    }
  });

  it("offers the cycle log tools only on a female profile, as the coach does", async () => {
    const names = async (token: string) => ((await (await call(token, "tools/list")).json()).result.tools as { name: string }[]).map((t) => t.name);
    expect(await names(mine)).not.toContain("log_period");
    expect(await names(theirs)).toContain("log_period");
  });

  it("an unknown tool and bad arguments are errors, not crashes", async () => {
    const unknown = await (await call(mine, "tools/call", { name: "delete_everything", arguments: {} })).json();
    expect(unknown.result?.isError ?? !!unknown.error).toBe(true);
    const bad = await tool(mine, "log_water", { ml: 1 });
    expect(bad.isError).toBe(true);
    expect(await db.select().from(loggedEntries)).toEqual([]);
  });
});

describe("one request, one user", () => {
  it("a token returns its own user's data and never another's", async () => {
    const mineSleep = await tool(mine, "get_sleep", { day: "2026-10-02" });
    expect(mineSleep.json).toMatchObject({ day: "2026-10-02", timeZone: TZ });
    expect(mineSleep.json.asleepMinutes.value).toBeGreaterThan(0);
    expect((await tool(mine, "get_profile")).json).toMatchObject({ sex: "male", maxHr: 183, timeZone: TZ, firstDayWithData: "2026-04-06" });

    const theirProfile = (await tool(theirs, "get_profile")).json;
    expect(theirProfile).toMatchObject({ sex: "female", maxHr: 199, timeZone: "America/New_York", firstDayWithData: null });
    const theirSleep = await tool(theirs, "get_sleep", { day: "2026-10-02" });
    expect(theirSleep.json.timeZone).toBe("America/New_York");
    expect(theirSleep.json.asleepMinutes.value).toBeNull();
    for (const name of ["get_day", "get_activities", "get_health", "get_report"] as const) {
      const out = (await tool(theirs, name)).text;
      expect(out, name).not.toContain("RUNNING");
      expect((await tool(theirs, name)).isError, name).toBe(false);
    }
    expect((await tool(theirs, "get_activities", { days: 90 })).json.workouts).toEqual([]);
    // The seeded user does have workouts, and their ids don't open for the other user.
    const workouts = (await tool(mine, "get_activities", { days: 90 })).json.workouts as { id: string }[];
    expect(workouts.length).toBeGreaterThan(0);
    expect((await tool(theirs, "get_activity", { id: workouts[0].id })).json).toMatchObject({ workout: null, reason: "no_data" });
    expect((await tool(mine, "get_activity", { id: workouts[0].id })).json.workout.id).toBe(workouts[0].id);
  });

  it("returns what the coach's own tools return", async () => {
    const coach = coachTools(ctxFor(db));
    const direct = await coach.get_day.execute!({ day: "2026-10-02" }, { toolCallId: "t", messages: [] } as never);
    expect((await tool(mine, "get_day", { day: "2026-10-02" })).json).toEqual(JSON.parse(JSON.stringify(direct)));
  });

  it("log tools write one entry for the token's user and no one else", async () => {
    const water = await tool(mine, "log_water", { ml: 500 });
    expect(water.json).toEqual({ logged: true });
    const mood = await tool(theirs, "log_mood", { moods: ["CALM"] });
    expect(mood.json).toEqual({ logged: true });
    const rows = await db.select({ userId: loggedEntries.userId, type: loggedEntries.type, data: loggedEntries.data }).from(loggedEntries).orderBy(loggedEntries.userId);
    expect(rows).toEqual([
      { userId: USER, type: "hydration-log", data: { ml: 500 } },
      { userId: other, type: "moods", data: expect.objectContaining({ moods: ["CALM"] }) },
    ]);
    // A cycle entry on a male profile is refused by the same write path the log sheets use.
    expect((await tool(mine, "log_period", { start: "2026-09-20", end: "2026-09-24" })).isError).toBe(true);
    expect(await db.select().from(loggedEntries).where(eq(loggedEntries.userId, USER))).toHaveLength(1);
  });

  it("revoking a token stops that agent at once", async () => {
    const t = await createToken(db, USER, "short-lived");
    expect((await call(t, "tools/list")).status).toBe(200);
    await revokeToken(db, USER, (await listTokens(db, USER)).find((x) => x.name === "short-lived")!.id);
    expect((await call(t, "tools/list")).status).toBe(401);
  });
});
