import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Config } from "../config";
import { type Db, openDb } from "../db";
import { journalEntries, journalTags } from "../db/schema";
import { DEFAULT_JOURNAL_TAGS, ensureDefaultTags } from "../journalTags";
import { addCustomTag, saveJournalEntry } from "./journal";

const h = vi.hoisted(() => ({ db: undefined as unknown, revalidate: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: h.revalidate }));
vi.mock("../config", async (orig) => ({ ...(await orig<object>()), getConfig: () => ({ timeZone: "Asia/Kolkata" }) as Config }));
vi.mock("../db", async (orig) => ({ ...(await orig<object>()), getDb: () => h.db as Db }));

let dir: string;
let db: Db;
const entries = () => db.select().from(journalEntries).all();

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-journal-"));
  db = h.db = openDb(path.join(dir, "test.db")) as Db;
  ensureDefaultTags(db);
  // 20:00 UTC on Oct 2 is 01:30 on Oct 3 in Kolkata.
  vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-02T20:00:00Z") });
});
afterAll(() => {
  vi.useRealTimers();
  db.$client.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
beforeEach(() => {
  db.delete(journalEntries).run();
  h.revalidate.mockClear();
});

describe("ensureDefaultTags", () => {
  it("is idempotent and keeps custom tags", async () => {
    expect(ensureDefaultTags(db)).toBe(0);
    await addCustomTag({ label: "Cold plunge" });
    expect(ensureDefaultTags(db)).toBe(0);
    const tags = db.select().from(journalTags).all();
    expect(tags.filter((t) => t.isDefault)).toHaveLength(DEFAULT_JOURNAL_TAGS.length);
    expect(tags.find((t) => t.tag === "cold_plunge")).toEqual({ tag: "cold_plunge", label: "Cold plunge", isDefault: false });
  });
});

describe("saveJournalEntry", () => {
  it("saves today in the configured time zone, and past days", async () => {
    expect(await saveJournalEntry({ day: "2026-10-03", tag: "alcohol", value: true })).toEqual({ ok: true, data: undefined });
    expect(await saveJournalEntry({ day: "2026-09-01", tag: "alcohol", value: 2 })).toMatchObject({ ok: true });
    expect(entries()).toEqual([
      { day: "2026-10-03", tag: "alcohol", value: 1 },
      { day: "2026-09-01", tag: "alcohol", value: 2 },
    ]);
    expect(h.revalidate.mock.calls).toEqual([["/journal"], ["/"], ["/journal"], ["/"]]);
  });

  it("rejects a future day", async () => {
    expect(await saveJournalEntry({ day: "2026-10-04", tag: "alcohol", value: true })).toEqual({ ok: false, error: "Can't log a future day" });
    expect(entries()).toEqual([]);
    expect(h.revalidate).not.toHaveBeenCalled();
  });

  it("rejects an unknown tag and malformed input", async () => {
    expect(await saveJournalEntry({ day: "2026-10-01", tag: "nope", value: true })).toEqual({ ok: false, error: "Unknown tag: nope" });
    expect((await saveJournalEntry({ day: "2026-13-01", tag: "alcohol", value: true })).ok).toBe(false);
    expect((await saveJournalEntry({ day: "2026-10-01", tag: "alcohol", value: -1 })).ok).toBe(false);
    expect((await saveJournalEntry({ day: "2026-10-01", tag: "alcohol", value: 1.5 })).ok).toBe(false);
    expect(entries()).toEqual([]);
  });

  it("a repeat submit is idempotent; a changed answer updates the row", async () => {
    const e = { day: "2026-10-01", tag: "meditation", value: true };
    await saveJournalEntry(e);
    await saveJournalEntry(e);
    expect(entries()).toEqual([{ day: "2026-10-01", tag: "meditation", value: 1 }]);
    await saveJournalEntry({ ...e, value: false });
    expect(entries()).toEqual([{ day: "2026-10-01", tag: "meditation", value: 0 }]);
  });

  it("null clears a saved answer back to unanswered, and is idempotent", async () => {
    await saveJournalEntry({ day: "2026-10-01", tag: "alcohol", value: true });
    await saveJournalEntry({ day: "2026-10-01", tag: "sauna", value: false });
    expect(await saveJournalEntry({ day: "2026-10-01", tag: "alcohol", value: null })).toEqual({ ok: true, data: undefined });
    expect(await saveJournalEntry({ day: "2026-10-01", tag: "alcohol", value: null })).toMatchObject({ ok: true });
    expect(entries()).toEqual([{ day: "2026-10-01", tag: "sauna", value: 0 }]);
    expect(await saveJournalEntry({ day: "2026-10-04", tag: "alcohol", value: null })).toMatchObject({ ok: false });
  });
});

describe("addCustomTag", () => {
  it("validates the label and rejects duplicates", async () => {
    expect(await addCustomTag({ label: "  Late  Workout! " })).toEqual({ ok: true, data: { tag: "late_workout" } });
    expect(await addCustomTag({ label: "late workout" })).toEqual({ ok: false, error: "Tag already exists: late_workout" });
    expect(await addCustomTag({ label: "Alcohol" })).toMatchObject({ ok: false });
    expect((await addCustomTag({ label: "   " })).ok).toBe(false);
    expect((await addCustomTag({ label: "!!!" })).ok).toBe(false);
    expect((await addCustomTag({ label: "x".repeat(41) })).ok).toBe(false);
    expect(await saveJournalEntry({ day: "2026-10-02", tag: "late_workout", value: true })).toMatchObject({ ok: true });
  });
});
