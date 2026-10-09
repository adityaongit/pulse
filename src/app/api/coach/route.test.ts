// POST /api/coach: who gets through, a full turn with the scripted model (a tool call, then text), saved per user, and
// the log tools' confirmation round trip.
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseConfig, type Config } from "@/server/config";
import { MOVED_ON } from "@/server/coach/approvals";
import { MOCK_REPLY } from "@/server/coach/mock";
import { listChats, loadChat, saveProvider, setCoachMode, setConsent } from "@/server/coach/store";
import type { Db } from "@/server/db";
import { loggedEntries, oauthTokens, profile, user } from "@/server/db/schema";
import { scopeUrl } from "@/lib/log";
import { addUser, freshDb, TZ, USER } from "@/server/testing";
import { POST } from "./route";

const h = vi.hoisted(() => ({ cfg: undefined as unknown, user: null as unknown, db: undefined as unknown, create: vi.fn() }));
vi.mock("@/server/config", async (orig) => ({ ...(await orig<object>()), getConfig: () => h.cfg as Config }));
vi.mock("@/server/auth", async (orig) => ({ ...(await orig<object>()), requestUser: async () => h.user }));
vi.mock("@/server/db", async (orig) => ({ ...(await orig<object>()), getDb: () => h.db as Db }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/worker", () => ({ requestSync: vi.fn() }));
vi.mock("@/server/sources/google/client", () => ({ createGoogleClient: () => ({ create: h.create, batchDelete: vi.fn() }) }));

const as = (userId: number) => (h.user = { userId, email: "x@pulse.test", name: "X", username: null, image: null });
const body = (id: string, text = "How am I today?") => ({ id, message: { id: `u-${Math.random()}`, role: "user", parts: [{ type: "text", text }] } });
const post = (b: unknown) => POST(new Request("http://localhost/api/coach", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }));

let db: Db;
beforeEach(async () => {
  h.cfg = parseConfig({ DATA_SOURCE: "google", GOOGLE_CLIENT_ID: "c", GOOGLE_CLIENT_SECRET: "s", BETTER_AUTH_SECRET: "x".repeat(32), COACH_MOCK: "true" });
  db = h.db = await freshDb();
  await db.insert(profile).values({ userId: USER, birthDate: "1990-01-01", sex: "male", timeZone: TZ, updatedAt: 0 });
  as(USER);
});

it("signed out 401; no access 404; no consent or provider 409; a bad body 400", async () => {
  h.user = null;
  expect((await post(body("chat-0001"))).status).toBe(401);
  as(USER);
  expect((await post(body("chat-0001"))).status).toBe(404);
  await setCoachMode(db, "everyone");
  expect((await post(body("chat-0001"))).status).toBe(409);
  await setConsent(db, USER, true);
  expect((await post(body("chat-0001"))).status).toBe(409);
  await saveProvider(db, USER, "mock", "mock", null);
  expect((await post({ id: "../etc", message: {} })).status).toBe(400);
});

it("a turn streams the get_day tool and the reply, then saves the chat for this user only", async () => {
  await setCoachMode(db, "everyone");
  await setConsent(db, USER, true);
  await saveProvider(db, USER, "mock", "mock", null);
  const res = await post(body("chat-0002"));
  expect(res.status).toBe(200);
  const text = await res.text();
  expect(text).toContain("tool-input-available");
  expect(text).toContain("get_day");
  expect(text).toContain("tool-output-available");
  expect(text).toContain("\"delta\":\"easy** \"");
  await vi.waitFor(async () => expect(await loadChat(db, USER, "chat-0002")).toHaveLength(2));
  const [, reply] = (await loadChat(db, USER, "chat-0002"))!;
  expect(reply.parts.map((p) => (p.type === "text" ? p.text : "")).join("")).toBe(MOCK_REPLY);

  // Another user posting to the same id gets a new chat of their own; the first one is untouched.
  const other = await addUser(db, "other@pulse.test");
  await db.insert(profile).values({ userId: other, birthDate: "1990-01-01", sex: "female", timeZone: TZ, updatedAt: 0 });
  await setConsent(db, other, true);
  await saveProvider(db, other, "mock", "mock", null);
  as(other);
  await (await post(body("chat-0002", "Mine"))).text();
  await vi.waitFor(async () => expect(await loadChat(db, other, "chat-0002")).toHaveLength(2));
  expect(await loadChat(db, USER, "chat-0002")).toHaveLength(2);
});

it("the 11th request in a minute is refused", async () => {
  // A user of its own: the guard counts per user in memory, across this file's tests.
  // (an id no other test used: each test's database restarts the id sequence, the guard's memory doesn't).
  const [{ id: fresh }] = await db.insert(user).values({ id: 9001, name: "Busy", email: "busy@pulse.test", emailVerified: true }).returning({ id: user.id });
  await db.insert(profile).values({ userId: fresh, birthDate: "1990-01-01", sex: "male", timeZone: TZ, updatedAt: 0 });
  as(fresh);
  await setCoachMode(db, "everyone");
  await setConsent(db, fresh, true);
  await saveProvider(db, fresh, "mock", "mock", null);
  const codes: number[] = [];
  for (let i = 0; i < 11; i++) {
    const r = await post(body(`chat-1${String(i).padStart(3, "0")}`));
    codes.push(r.status);
    await r.text();
  }
  expect(codes.slice(0, 10)).toEqual(Array(10).fill(200));
  expect(codes[10]).toBe(429);
});

/** A user of its own (the per-minute guard is per user and outlives each test's database), set up for the mock model. */
async function ready(id: number) {
  await db.insert(user).values({ id, name: `U${id}`, email: `u${id}@pulse.test`, emailVerified: true });
  await db.insert(profile).values({ userId: id, birthDate: "1990-01-01", sex: "male", timeZone: TZ, updatedAt: 0 });
  as(id);
  await setCoachMode(db, "everyone");
  await setConsent(db, id, true);
  await saveProvider(db, id, "mock", "mock", null);
}
const say = (id: string, text: string) => ({ id, role: "user", parts: [{ type: "text", text }] });
const turn = async (b: unknown) => {
  const r = await post(b);
  await r.text();
  return r.status;
};
const textOf = (m: { parts: { type: string; text?: string }[] }) => m.parts.map((p) => p.text ?? "").join("");

it("an edit drops the edited message and everything after it, then answers the new text", async () => {
  await ready(9002);
  await turn({ id: "chat-edit-1", message: say("u1", "First") });
  await vi.waitFor(async () => expect(await loadChat(db, 9002, "chat-edit-1")).toHaveLength(2));
  await turn({ id: "chat-edit-1", message: say("u2", "Second") });
  await vi.waitFor(async () => expect(await loadChat(db, 9002, "chat-edit-1")).toHaveLength(4));

  expect(await turn({ id: "chat-edit-1", message: say("u1", "First, edited"), trigger: "submit-message", messageId: "u1" })).toBe(200);
  await vi.waitFor(async () => expect(await loadChat(db, 9002, "chat-edit-1")).toHaveLength(2));
  const [edited, reply] = (await loadChat(db, 9002, "chat-edit-1"))!;
  expect([edited.id, textOf(edited)]).toEqual(["u1", "First, edited"]);
  expect([reply.role, textOf(reply)]).toEqual(["assistant", MOCK_REPLY]);
  expect((await listChats(db, 9002)).chats[0].title).toBe("First, edited"); // the title follows the first question
});

it("regenerate replaces the answer; a message id the chat doesn't have, or a mismatched edit, is a 400", async () => {
  await ready(9003);
  await turn({ id: "chat-regen-1", message: say("u1", "First") });
  await vi.waitFor(async () => expect(await loadChat(db, 9003, "chat-regen-1")).toHaveLength(2));
  const [, before] = (await loadChat(db, 9003, "chat-regen-1"))!;

  expect(await turn({ id: "chat-regen-1", message: say("u1", "First"), trigger: "regenerate-message", messageId: before.id })).toBe(200);
  await vi.waitFor(async () => {
    const chat = (await loadChat(db, 9003, "chat-regen-1"))!;
    expect(chat).toHaveLength(2);
    expect(chat[1].id).not.toBe(before.id);
  });

  // Another chat's (or user's) message, an assistant message as the edit target, an edit under another id, an unknown key.
  expect(await turn({ id: "chat-regen-1", message: say("u1", "x"), trigger: "regenerate-message", messageId: "not-in-this-chat" })).toBe(400);
  expect(await turn({ id: "chat-regen-1", message: say("u9", "x"), trigger: "submit-message", messageId: "u9" })).toBe(400);
  const [, now] = (await loadChat(db, 9003, "chat-regen-1"))!;
  expect(await turn({ id: "chat-regen-1", message: say(now.id, "x"), trigger: "submit-message", messageId: now.id })).toBe(400);
  expect(await turn({ id: "chat-regen-1", message: say("u2", "x"), trigger: "submit-message", messageId: "u1" })).toBe(400);
  expect(await turn({ id: "chat-regen-1", message: say("u2", "x"), extra: true })).toBe(400);
  expect(await loadChat(db, 9003, "chat-regen-1")).toHaveLength(2);
});

describe("log tools wait for the user's answer", () => {
  /** A user whose Google grant allows logging water, with Google's writer stubbed. */
  const ready2 = async (id: number) => {
    await ready(id);
    await db.insert(oauthTokens).values({ userId: id, accessToken: "a", refreshToken: "r", expiresAt: 0, scope: scopeUrl("hydration-log"), updatedAt: 0 });
    h.create.mockReset().mockResolvedValue(`users/${id}/dataTypes/hydration-log/dataPoints/1`);
  };
  const entries = (userId: number) => db.select().from(loggedEntries).where(eq(loggedEntries.userId, userId));
  type Tool = { type: string; state: string; approval?: { id: string; approved?: boolean; reason?: string }; output?: unknown };
  const logPart = async (userId: number, chat: string) => (await loadChat(db, userId, chat))!.at(-1)!.parts.find((p) => p.type === "tool-log_water") as Tool;
  const asked = async (userId: number, chat: string) => {
    expect(await turn({ id: chat, message: say("u1", "Please log 500 ml of water") })).toBe(200);
    await vi.waitFor(async () => expect((await logPart(userId, chat))?.state).toBe("approval-requested"));
    return (await logPart(userId, chat)).approval!.id;
  };

  it("asks first, logs only after the user approves, and answers in the same message", async () => {
    await ready2(9004);
    const approval = await asked(9004, "chat-log-1");
    expect(await entries(9004)).toEqual([]);

    expect(await turn({ id: "chat-log-1", approvals: [{ id: approval, approved: true }] })).toBe(200);
    await vi.waitFor(async () => expect((await logPart(9004, "chat-log-1")).state).toBe("output-available"));
    expect((await logPart(9004, "chat-log-1")).output).toEqual({ logged: true });
    expect((await entries(9004)).map((e) => [e.type, e.data, e.googleName])).toEqual([["hydration-log", { ml: 500 }, "users/9004/dataTypes/hydration-log/dataPoints/1"]]);
    const chat = (await loadChat(db, 9004, "chat-log-1"))!;
    expect(chat).toHaveLength(2);
    await vi.waitFor(async () => expect(textOf((await loadChat(db, 9004, "chat-log-1"))!.at(-1)!)).toContain(MOCK_REPLY));
  });

  it("a denial logs nothing, and an answer can't be replayed", async () => {
    await ready2(9005);
    const approval = await asked(9005, "chat-log-2");
    expect(await turn({ id: "chat-log-2", approvals: [{ id: approval, approved: false }] })).toBe(200);
    await vi.waitFor(async () => expect((await logPart(9005, "chat-log-2")).state).toBe("output-denied"));
    expect(await entries(9005)).toEqual([]);
    expect(h.create).not.toHaveBeenCalled();
    expect(await turn({ id: "chat-log-2", approvals: [{ id: approval, approved: true }] })).toBe(400);
    expect(await entries(9005)).toEqual([]);
  });

  it("the same answer sent twice at once (a double tap, a second tab) logs once", async () => {
    await ready2(9009);
    const approval = await asked(9009, "chat-log-5");
    const answer = { id: "chat-log-5", approvals: [{ id: approval, approved: true }] };
    const codes = (await Promise.all([turn(answer), turn(answer)])).sort();
    expect(codes).toEqual([200, 409]);
    await vi.waitFor(async () => expect((await logPart(9009, "chat-log-5")).state).toBe("output-available"));
    expect(await entries(9009)).toHaveLength(1);
    expect(h.create).toHaveBeenCalledTimes(1);
  });

  it("only the chat's own open confirmation can be answered: not a made-up id, nor another user's chat", async () => {
    await ready2(9006);
    const approval = await asked(9006, "chat-log-3");
    expect(await turn({ id: "chat-log-3", approvals: [{ id: "made-up", approved: true }] })).toBe(400);
    expect(await turn({ id: "chat-log-3", approvals: [{ id: approval, approved: true }, { id: approval, approved: false }] })).toBe(400);
    expect(await turn({ id: "chat-log-3", approvals: [{ id: approval, approved: true }], message: say("u2", "x") })).toBe(400);
    await ready2(9007);
    expect(await turn({ id: "chat-log-3", approvals: [{ id: approval, approved: true }] })).toBe(400);
    expect(await entries(9006)).toEqual([]);
    expect(await entries(9007)).toEqual([]);
    expect((await logPart(9006, "chat-log-3")).state).toBe("approval-requested");
  });

  it("writing again instead of answering declines the open confirmation", async () => {
    await ready2(9008);
    await asked(9008, "chat-log-4");
    expect(await turn({ id: "chat-log-4", message: say("u2", "How am I today?") })).toBe(200);
    await vi.waitFor(async () => expect(await loadChat(db, 9008, "chat-log-4")).toHaveLength(4));
    const [, first] = (await loadChat(db, 9008, "chat-log-4"))!;
    const part = first.parts.find((p) => p.type === "tool-log_water") as Tool;
    expect(part).toMatchObject({ state: "output-denied", approval: { approved: false, reason: MOVED_ON } });
    expect(await entries(9008)).toEqual([]);
  });
});
