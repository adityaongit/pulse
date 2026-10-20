import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../db";
import { mcpTokens, user } from "../db/schema";
import { addUser, freshDb, USER } from "../testing";
import { createToken, listTokens, revokeToken, TOKEN_PREFIX, userForToken } from "./tokens";

let db: Db;
let other: number;
beforeEach(async () => {
  db = await freshDb();
  other = await addUser(db);
});

describe("personal access tokens", () => {
  it("are random, shown once, and stored only as a SHA-256 hash", async () => {
    const a = await createToken(db, USER, "Hermes");
    const b = await createToken(db, USER, "Hermes");
    expect(a).toMatch(/^pulse_[\w-]{43}$/);
    expect(a).not.toBe(b);
    const stored = await db.select().from(mcpTokens);
    expect(stored.map((r) => r.tokenHash).sort()).toEqual([a, b].map((t) => createHash("sha256").update(t).digest("hex")).sort());
    expect(JSON.stringify(stored)).not.toContain(a.slice(TOKEN_PREFIX.length));
  });

  it("resolve to the one user that owns them, stamp last use, and refuse anything else", async () => {
    const mine = await createToken(db, USER, "Mine");
    const theirs = await createToken(db, other, "Theirs");
    expect((await listTokens(db, USER))[0].lastUsedAt).toBeNull();
    expect(await userForToken(db, mine)).toBe(USER);
    expect(await userForToken(db, theirs)).toBe(other);
    expect((await listTokens(db, USER))[0].lastUsedAt).toBeGreaterThan(0);
    expect((await listTokens(db, other))[0].lastUsedAt).toBeGreaterThan(0);
    for (const bad of ["", "pulse_", `${mine}x`, mine.slice(0, -1), "pulse_nope"]) expect(await userForToken(db, bad), bad).toBeNull();
  });

  it("are listed and revoked per user: nobody sees or deletes another's", async () => {
    const mine = await createToken(db, USER, "Mine");
    await createToken(db, other, "Theirs");
    const [row] = await listTokens(db, USER);
    expect(row).toMatchObject({ name: "Mine", lastUsedAt: null });
    expect(Object.keys(row).sort()).toEqual(["createdAt", "id", "lastUsedAt", "name"]); // never the hash
    const theirId = (await listTokens(db, other))[0].id;
    await revokeToken(db, USER, theirId);
    expect(await listTokens(db, other)).toHaveLength(1);
    await revokeToken(db, USER, row.id);
    expect(await userForToken(db, mine)).toBeNull();
    expect(await listTokens(db, USER)).toEqual([]);
  });

  it("go with the account", async () => {
    await createToken(db, other, "Theirs");
    await db.delete(user).where(eq(user.id, other));
    expect(await db.select().from(mcpTokens)).toEqual([]);
  });
});
