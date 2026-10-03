import { beforeEach, describe, expect, it, vi } from "vitest";
import { openDb, type Db } from "../db";
import { avatarSrc, setOwnerPicture, uploadedAvatar } from "../avatar";
import { removeAvatar, uploadAvatar } from "./avatar";

const h = vi.hoisted(() => ({ db: undefined as unknown, session: { kind: "owner", email: "me@example.com" } as unknown }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../auth", async (orig) => ({ ...(await orig<object>()), currentSession: async () => h.session }));
vi.mock("../db", async (orig) => ({ ...(await orig<object>()), getDb: () => h.db as Db }));
vi.mock("../config", async (orig) => ({ ...(await orig<object>()), getConfig: () => ({ avatarUrl: null }) }));

let db: Db;
const form = (file: File) => {
  const f = new FormData();
  f.set("photo", file);
  return f;
};

beforeEach(() => {
  db = h.db = openDb(":memory:");
  db.$client.prepare("insert into instance (id, session_secret) values (1, 's')").run();
  h.session = { kind: "owner", email: "me@example.com" };
});

describe("avatar", () => {
  it("an upload wins over the Google photo, and removing it falls back to Google", async () => {
    setOwnerPicture(db, "https://lh3.googleusercontent.com/a/me");
    expect(avatarSrc(db)).toBe("https://lh3.googleusercontent.com/a/me");
    expect(await uploadAvatar(form(new File([new Uint8Array([1, 2, 3])], "me.png", { type: "image/png" })))).toEqual({ ok: true, data: undefined });
    expect(avatarSrc(db)).toMatch(/^\/avatar\?v=\d+$/);
    expect(uploadedAvatar(db)).toMatchObject({ type: "image/png" });
    await removeAvatar();
    expect(avatarSrc(db)).toBe("https://lh3.googleusercontent.com/a/me");
  });

  it("refuses other types, oversize files and signed-out callers", async () => {
    expect(await uploadAvatar(form(new File(["<svg/>"], "x.svg", { type: "image/svg+xml" })))).toMatchObject({ ok: false });
    expect(await uploadAvatar(form(new File([new Uint8Array(2 * 1024 * 1024 + 1)], "big.jpg", { type: "image/jpeg" })))).toMatchObject({
      ok: false,
      error: "Use a photo under 2 MB",
    });
    h.session = null;
    expect(await uploadAvatar(form(new File([new Uint8Array([1])], "a.png", { type: "image/png" })))).toMatchObject({ ok: false });
    expect(uploadedAvatar(db)).toBeNull();
  });
});
