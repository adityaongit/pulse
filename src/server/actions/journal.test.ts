import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Config } from "../config";
import { type Db, openDb } from "../db";
import { intradayDirty, journalEntries, journalTags } from "../db/schema";
import { DEFAULT_JOURNAL_TAGS, ensureDefaultTags } from "../journalTags";
import { needsRecompute } from "../pipeline";
import { addCustomTag, reorderBehaviours, saveJournalEntry, setBehaviourHidden } from "./journal";

const h = vi.hoisted(() => ({ db: undefined as unknown, revalidate: vi.fn(), requestSync: vi.fn(), session: { kind: "demo" } as unknown }));
vi.mock("../worker", () => ({ requestSync: h.requestSync }));
vi.mock("../auth", async (orig) => ({ ...(await orig<object>()), currentSession: async () => h.session }));
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
  db.delete(intradayDirty).run();
  h.revalidate.mockClear();
  h.requestSync.mockClear();
  h.session = { kind: "demo" };
});

it("signed out, both writes are refused and nothing is stored", async () => {
  h.session = null;
  expect(await saveJournalEntry({ day: "2026-10-01", tag: "alcohol", value: true })).toEqual({ ok: false, error: "Signed out. Sign in again." });
  expect(await addCustomTag({ label: "Signed out tag" })).toMatchObject({ ok: false });
  expect(entries()).toEqual([]);
  expect(db.select().from(journalTags).all().some((t) => t.tag === "signed_out_tag")).toBe(false);
});

describe("ensureDefaultTags", () => {
  it("is idempotent and keeps custom tags", async () => {
    expect(ensureDefaultTags(db)).toBe(0);
    await addCustomTag({ label: "Cold plunge" });
    expect(ensureDefaultTags(db)).toBe(0);
    const tags = db.select().from(journalTags).all();
    expect(tags.filter((t) => t.isDefault)).toHaveLength(DEFAULT_JOURNAL_TAGS.length);
    expect(tags.find((t) => t.tag === "cold_plunge")).toMatchObject({ tag: "cold_plunge", label: "Cold plunge", isDefault: false, hidden: false });
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

  it("marks a recompute needed and kicks the worker past its gate", async () => {
    expect(needsRecompute(db)).toBe(false);
    await saveJournalEntry({ day: "2026-09-30", tag: "alcohol", value: true });
    await saveJournalEntry({ day: "2026-09-30", tag: "alcohol", value: null });
    expect(db.select().from(intradayDirty).all()).toEqual([{ day: "2026-09-30" }]);
    expect(needsRecompute(db)).toBe(true);
    expect(h.requestSync.mock.calls).toEqual([[{ force: true }], [{ force: true }]]);
  });

  it("rejects a future day", async () => {
    expect(await saveJournalEntry({ day: "2026-10-04", tag: "alcohol", value: true })).toEqual({ ok: false, error: "Can't log a future day" });
    expect(entries()).toEqual([]);
    expect(h.revalidate).not.toHaveBeenCalled();
    expect(h.requestSync).not.toHaveBeenCalled();
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

  it("puts a new behaviour after every existing one", async () => {
    await reorderBehaviours({ tags: ["late_workout", "cold_plunge"] });
    await addCustomTag({ label: "Nap" });
    const order = db.$client.prepare("select tag from journal_tags where is_default = 0 order by position, rowid").pluck().all();
    expect(order).toEqual(["late_workout", "cold_plunge", "nap"]);
  });
});

describe("setBehaviourHidden and reorderBehaviours", () => {
  const tag = (t: string) => db.select().from(journalTags).all().find((x) => x.tag === t)!;

  it("signed out, both are refused and nothing changes", async () => {
    h.session = null;
    expect(await setBehaviourHidden({ tag: "sauna", hidden: true })).toEqual({ ok: false, error: "Signed out. Sign in again." });
    expect(await reorderBehaviours({ tags: ["sauna", "meditation"] })).toEqual({ ok: false, error: "Signed out. Sign in again." });
    expect(tag("sauna")).toMatchObject({ hidden: false, position: 0 });
  });

  it("hides and shows a behaviour without touching its answers", async () => {
    await saveJournalEntry({ day: "2026-10-01", tag: "sauna", value: true });
    expect(await setBehaviourHidden({ tag: "sauna", hidden: true })).toEqual({ ok: true, data: undefined });
    expect(tag("sauna").hidden).toBe(true);
    expect(entries()).toEqual([{ day: "2026-10-01", tag: "sauna", value: 1 }]);
    // A hidden behaviour can still be answered (an old check-in edited) and is shown again on request.
    expect(await saveJournalEntry({ day: "2026-09-30", tag: "sauna", value: false })).toMatchObject({ ok: true });
    expect(await setBehaviourHidden({ tag: "sauna", hidden: false })).toMatchObject({ ok: true });
    expect(tag("sauna").hidden).toBe(false);
    expect(h.revalidate).toHaveBeenCalledWith("/more/behaviours");
    expect(await setBehaviourHidden({ tag: "nope", hidden: true })).toEqual({ ok: false, error: "Unknown tag: nope" });
  });

  it("writes one group's order and refuses unknown or repeated tags whole", async () => {
    expect(await reorderBehaviours({ tags: ["stretching", "sauna", "meditation"] })).toMatchObject({ ok: true });
    const order = db.$client.prepare("select tag from journal_tags where tag in ('meditation','stretching','sauna') order by position, rowid").pluck().all();
    expect(order).toEqual(["stretching", "sauna", "meditation"]);
    expect(await reorderBehaviours({ tags: ["sauna", "nope"] })).toMatchObject({ ok: false });
    expect(await reorderBehaviours({ tags: ["sauna", "sauna"] })).toMatchObject({ ok: false });
    expect(await reorderBehaviours({ tags: [] })).toMatchObject({ ok: false });
    expect(tag("stretching").position).toBe(0);
    expect(tag("sauna").position).toBe(1);
  });
});
