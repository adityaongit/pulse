// Settings › Agents: signed-in only, a name, a cap, and only ever the caller's own tokens.
import { beforeEach, expect, it, vi } from "vitest";
import type { Db } from "../db";
import { addUser, freshDb, USER } from "../testing";
import { createToken, listTokens, MAX_TOKENS, userForToken } from "../mcp/tokens";
import { createMcpTokenAction, revokeMcpTokenAction } from "./mcp";

const h = vi.hoisted(() => ({ db: undefined as unknown, user: null as unknown }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../auth", async (orig) => ({ ...(await orig<object>()), currentUser: async () => h.user }));
vi.mock("../db", async (orig) => ({ ...(await orig<object>()), getDb: () => h.db as Db }));

const ME = { userId: USER, email: "me@example.com", name: "Me", username: "me", image: null };
let db: Db;
let other: number;
beforeEach(async () => {
  db = h.db = await freshDb();
  other = await addUser(db);
  h.user = ME;
});

it("a signed-out caller makes and revokes nothing", async () => {
  h.user = null;
  expect(await createMcpTokenAction("Hermes")).toEqual({ ok: false, error: "Signed out. Sign in again." });
  const token = await createToken(db, USER, "Mine");
  expect(await revokeMcpTokenAction((await listTokens(db, USER))[0].id)).toMatchObject({ ok: false });
  expect(await userForToken(db, token)).toBe(USER);
  expect(await listTokens(db, USER)).toHaveLength(1);
});

it("creates a token for the caller that works at once, trimming the name", async () => {
  const r = await createMcpTokenAction("  Hermes  ");
  expect(r).toEqual({ ok: true, data: expect.stringMatching(/^pulse_/) });
  if (!r.ok) throw new Error("unreachable");
  expect(await userForToken(db, r.data)).toBe(USER);
  expect(await listTokens(db, USER)).toEqual([expect.objectContaining({ name: "Hermes" })]);
  expect(await listTokens(db, other)).toEqual([]);
});

it("refuses an empty or over-long name, and more than the cap", async () => {
  expect(await createMcpTokenAction("   ")).toMatchObject({ ok: false });
  expect(await createMcpTokenAction("x".repeat(61))).toMatchObject({ ok: false });
  for (let i = 0; i < MAX_TOKENS; i++) expect((await createMcpTokenAction(`t${i}`)).ok).toBe(true);
  expect(await createMcpTokenAction("one too many")).toMatchObject({ ok: false });
  expect(await listTokens(db, USER)).toHaveLength(MAX_TOKENS);
});

it("revokes the caller's own token and cannot touch another person's", async () => {
  const mine = await createToken(db, USER, "Mine");
  const theirs = await createToken(db, other, "Theirs");
  const theirId = (await listTokens(db, other))[0].id;
  expect(await revokeMcpTokenAction(theirId)).toEqual({ ok: true, data: undefined });
  expect(await userForToken(db, theirs)).toBe(other);
  expect(await revokeMcpTokenAction((await listTokens(db, USER))[0].id)).toEqual({ ok: true, data: undefined });
  expect(await userForToken(db, mine)).toBeNull();
  expect(await revokeMcpTokenAction(1.5)).toMatchObject({ ok: false });
});
