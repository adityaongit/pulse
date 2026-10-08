import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, asc, eq } from "drizzle-orm";
import type { Db } from "../db";
import { intradayDirty, journalEntries, journalNotes, journalTags } from "../db/schema";
import { DEFAULT_JOURNAL_TAGS, ensureDefaultTags, MAX_TAGS } from "../journalTags";
import { needsRecompute } from "../pipeline";
import { saveProfile } from "../profile";
import { addUser, freshDb, USER } from "../testing";
import { addCustomTag, loadBehaviours, loadCheckIn, saveBehaviors, saveJournalEntry, saveJournalNote } from "./journal";

const h = vi.hoisted(() => ({ db: undefined as unknown, revalidate: vi.fn(), requestSync: vi.fn(), user: null as unknown }));
vi.mock("../worker", () => ({ requestSync: h.requestSync }));
vi.mock("../auth", async (orig) => ({ ...(await orig<object>()), currentUser: async () => h.user }));
vi.mock("next/cache", () => ({ revalidatePath: h.revalidate }));
vi.mock("../db", async (orig) => ({ ...(await orig<object>()), getDb: () => h.db as Db }));

const ME = { userId: USER, email: "me@example.com", name: "Me", username: "me", image: null };
let db: Db;
let other: number;
const entries = async () =>
  (await db.select().from(journalEntries).where(eq(journalEntries.userId, USER))).map(({ day, tag, value }) => ({ day, tag, value }));
const allTags = () => db.select().from(journalTags).where(eq(journalTags.userId, USER));
/** Tags in display order: position, then insertion (seq). */
const order = async (where: ReturnType<typeof and>) =>
  (await db.select({ tag: journalTags.tag }).from(journalTags).where(and(eq(journalTags.userId, USER), where)).orderBy(asc(journalTags.position), asc(journalTags.seq))).map((r) => r.tag);

beforeAll(async () => {
  db = h.db = await freshDb();
  other = await addUser(db);
  await ensureDefaultTags(db, USER);
  await ensureDefaultTags(db, other);
  await saveProfile(db, USER, { birthDate: "1990-01-01", sex: "male", maxHr: null, heightCm: null, timeZone: "Asia/Kolkata" });
  // 20:00 UTC on Oct 2 is 01:30 on Oct 3 in Kolkata.
  vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-02T20:00:00Z") });
});
afterAll(() => {
  vi.useRealTimers();
});
beforeEach(async () => {
  await db.delete(journalEntries);
  await db.delete(intradayDirty);
  h.revalidate.mockClear();
  h.requestSync.mockClear();
  h.user = ME;
});

it("signed out, both writes are refused and nothing is stored", async () => {
  h.user = null;
  expect(await saveJournalEntry({ day: "2026-10-01", tag: "alcohol", value: true })).toEqual({ ok: false, error: "Signed out. Sign in again." });
  expect(await addCustomTag({ label: "Signed out tag" })).toMatchObject({ ok: false });
  expect(await entries()).toEqual([]);
  expect((await allTags()).some((t) => t.tag === "signed_out_tag")).toBe(false);
});

describe("ensureDefaultTags", () => {
  it("is idempotent and keeps custom tags", async () => {
    expect(await ensureDefaultTags(db, USER)).toBe(0);
    await addCustomTag({ label: "Cold plunge" });
    expect(await ensureDefaultTags(db, USER)).toBe(0);
    const tags = await allTags();
    expect(tags.filter((t) => t.isDefault)).toHaveLength(DEFAULT_JOURNAL_TAGS.length);
    expect(tags.find((t) => t.tag === "cold_plunge")).toMatchObject({ tag: "cold_plunge", label: "Cold plunge", isDefault: false, hidden: false });
  });
});

describe("saveJournalEntry", () => {
  it("saves today in the user's time zone, and past days", async () => {
    expect(await saveJournalEntry({ day: "2026-10-03", tag: "alcohol", value: true })).toEqual({ ok: true, data: undefined });
    expect(await saveJournalEntry({ day: "2026-09-01", tag: "alcohol", value: 2 })).toMatchObject({ ok: true });
    expect(await entries()).toEqual([
      { day: "2026-10-03", tag: "alcohol", value: 1 },
      { day: "2026-09-01", tag: "alcohol", value: 2 },
    ]);
    expect(h.revalidate.mock.calls).toEqual([["/journal"], ["/"], ["/journal"], ["/"]]);
  });

  it("marks a recompute needed and kicks the worker past its gate", async () => {
    expect(await needsRecompute(db, USER)).toBe(false);
    await saveJournalEntry({ day: "2026-09-30", tag: "alcohol", value: true });
    await saveJournalEntry({ day: "2026-09-30", tag: "alcohol", value: null });
    expect(await db.select().from(intradayDirty)).toEqual([{ userId: USER, day: "2026-09-30" }]);
    expect(await needsRecompute(db, USER)).toBe(true);
    expect(h.requestSync.mock.calls).toEqual([[{ userId: USER, force: true }], [{ userId: USER, force: true }]]);
  });

  it("rejects a future day", async () => {
    expect(await saveJournalEntry({ day: "2026-10-04", tag: "alcohol", value: true })).toEqual({ ok: false, error: "Can’t log a future day" });
    expect(await entries()).toEqual([]);
    expect(h.revalidate).not.toHaveBeenCalled();
    expect(h.requestSync).not.toHaveBeenCalled();
  });

  it("rejects an unknown tag and malformed input", async () => {
    expect(await saveJournalEntry({ day: "2026-10-01", tag: "nope", value: true })).toEqual({ ok: false, error: "Unknown tag: nope" });
    expect((await saveJournalEntry({ day: "2026-13-01", tag: "alcohol", value: true })).ok).toBe(false);
    expect((await saveJournalEntry({ day: "2026-10-01", tag: "alcohol", value: -1 })).ok).toBe(false);
    expect((await saveJournalEntry({ day: "2026-10-01", tag: "alcohol", value: 1.5 })).ok).toBe(false);
    expect(await entries()).toEqual([]);
  });

  it("a repeat submit is idempotent; a changed answer updates the row", async () => {
    const e = { day: "2026-10-01", tag: "meditation", value: true };
    await saveJournalEntry(e);
    await saveJournalEntry(e);
    expect(await entries()).toEqual([{ day: "2026-10-01", tag: "meditation", value: 1 }]);
    await saveJournalEntry({ ...e, value: false });
    expect(await entries()).toEqual([{ day: "2026-10-01", tag: "meditation", value: 0 }]);
  });

  it("null clears a saved answer back to unanswered, and is idempotent", async () => {
    await saveJournalEntry({ day: "2026-10-01", tag: "alcohol", value: true });
    await saveJournalEntry({ day: "2026-10-01", tag: "sauna", value: false });
    expect(await saveJournalEntry({ day: "2026-10-01", tag: "alcohol", value: null })).toEqual({ ok: true, data: undefined });
    expect(await saveJournalEntry({ day: "2026-10-01", tag: "alcohol", value: null })).toMatchObject({ ok: true });
    expect(await entries()).toEqual([{ day: "2026-10-01", tag: "sauna", value: 0 }]);
    expect(await saveJournalEntry({ day: "2026-10-04", tag: "alcohol", value: null })).toMatchObject({ ok: false });
  });
});

describe("loadCheckIn", () => {
  it("returns the shown behaviours and the day's answers; refuses a future day and a signed-out caller", async () => {
    await saveJournalEntry({ day: "2026-10-01", tag: "alcohol", value: true });
    const r = await loadCheckIn("2026-10-01");
    expect(r.ok && r.data.checkIn).toMatchObject({ done: true, entries: { alcohol: 1 } });
    expect(r.ok && r.data.tags.some((t) => t.tag === "alcohol")).toBe(true);
    expect(await loadCheckIn("2026-10-04")).toMatchObject({ ok: false });
    expect(await loadCheckIn("nope")).toMatchObject({ ok: false });
    // Too far back: the sheet's day strip would run from that day to today.
    expect(await loadCheckIn("2010-01-01")).toMatchObject({ ok: false });
    h.user = null;
    expect(await loadCheckIn("2026-10-01")).toMatchObject({ ok: false });
  });
});

describe("addCustomTag", () => {
  it("stops at MAX_TAGS, so insights work per recompute stays bounded", async () => {
    h.user = { ...ME, userId: other };
    const have = (await db.select().from(journalTags).where(eq(journalTags.userId, other))).length;
    for (let i = have; i < MAX_TAGS; i++) expect((await addCustomTag({ label: `Cap ${i}` })).ok).toBe(true);
    expect(await addCustomTag({ label: "One more" })).toEqual({ ok: false, error: `Too many behaviours: the limit is ${MAX_TAGS}` });
    h.user = ME;
  });

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
    const before = await order(eq(journalTags.isDefault, false));
    await addCustomTag({ label: "Nap" });
    expect(await order(eq(journalTags.isDefault, false))).toEqual([...before, "nap"]);
  });
});

describe("saveBehaviors", () => {
  const tag = async (t: string) => (await allTags()).find((x) => x.tag === t)!;
  const everyoneBut = async (t: string) => (await allTags()).map((x) => x.tag).filter((x) => x !== t);

  it("signed out, it is refused and nothing changes", async () => {
    h.user = null;
    expect(await saveBehaviors({ tags: [] })).toEqual({ ok: false, error: "Signed out. Sign in again." });
    expect((await tag("sauna")).hidden).toBe(false);
  });

  it("hides a behaviour left out without touching its answers, and shows it again", async () => {
    await saveJournalEntry({ day: "2026-10-01", tag: "sauna", value: true });
    expect(await saveBehaviors({ tags: await everyoneBut("sauna") })).toEqual({ ok: true, data: undefined });
    expect((await tag("sauna")).hidden).toBe(true);
    expect(await entries()).toEqual([{ day: "2026-10-01", tag: "sauna", value: 1 }]);
    // A hidden behaviour can still be answered (an old check-in edited) and is shown again on request.
    expect(await saveJournalEntry({ day: "2026-09-30", tag: "sauna", value: false })).toMatchObject({ ok: true });
    expect(await saveBehaviors({ tags: (await allTags()).map((x) => x.tag) })).toMatchObject({ ok: true });
    expect((await tag("sauna")).hidden).toBe(false);
    expect(h.revalidate).toHaveBeenCalledWith("/more/behaviours");
  });
});

describe("per user", () => {
  it("another user's behaviours and answers are untouched; their custom tag is unknown here", async () => {
    await db.insert(journalTags).values({ userId: other, tag: "their_tag", label: "Their tag" });
    expect(await saveJournalEntry({ day: "2026-10-01", tag: "their_tag", value: true })).toEqual({ ok: false, error: "Unknown tag: their_tag" });
    const mine = (await allTags()).map((x) => x.tag);
    await saveBehaviors({ tags: mine.filter((x) => x !== "alcohol") });
    const [theirs] = await db.select().from(journalTags).where(and(eq(journalTags.userId, other), eq(journalTags.tag, "alcohol")));
    expect(theirs.hidden).toBe(false);
    await saveBehaviors({ tags: mine });
    // Same key, two users: both can have it.
    expect(await addCustomTag({ label: "Their tag" })).toEqual({ ok: true, data: { tag: "their_tag" } });
  });
});

describe("follow-ups, notes and Select Behaviors", () => {
  it("keeps a follow-up answer only with a yes", async () => {
    await saveJournalEntry({ day: "2026-10-01", tag: "alcohol", value: true, detail: 3 });
    await saveJournalEntry({ day: "2026-10-02", tag: "alcohol", value: false, detail: 3 });
    const rows = await db.select({ day: journalEntries.day, detail: journalEntries.detail }).from(journalEntries).where(eq(journalEntries.userId, USER)).orderBy(journalEntries.day);
    expect(rows).toEqual([{ day: "2026-10-01", detail: 3 }, { day: "2026-10-02", detail: null }]);
    expect(await saveJournalEntry({ day: "2026-10-01", tag: "alcohol", value: true, detail: 2000 })).toMatchObject({ ok: false });
    const r = await loadCheckIn("2026-10-01");
    expect(r.ok && r.data.checkIn.details).toEqual({ alcohol: 3 });
  });

  it("saves, replaces and clears a day's note, for this user only, never for a future day", async () => {
    const notes = () => db.select({ userId: journalNotes.userId, day: journalNotes.day, text: journalNotes.text }).from(journalNotes);
    expect(await saveJournalNote({ day: "2026-10-03", text: "  Slept at a friend's  " })).toEqual({ ok: true, data: undefined });
    await saveJournalNote({ day: "2026-10-03", text: "Slept badly" });
    expect(await notes()).toEqual([{ userId: USER, day: "2026-10-03", text: "Slept badly" }]);
    const r = await loadCheckIn("2026-10-03");
    expect(r.ok && r.data.checkIn.note).toBe("Slept badly");
    expect(await saveJournalNote({ day: "2026-10-04", text: "Later" })).toMatchObject({ ok: false });
    await saveJournalNote({ day: "2026-10-03", text: "   " });
    expect(await notes()).toEqual([]);
  });

  it("asks exactly the chosen behaviours: adds catalogue ones, hides the rest, refuses unknown keys whole", async () => {
    expect(await saveBehaviors({ tags: ["mouth_tape", "illness", "electrolytes"] })).toEqual({ ok: true, data: undefined });
    const shown = async () => (await allTags()).filter((t) => !t.hidden).map((t) => t.tag).sort();
    expect(await shown()).toEqual(["electrolytes", "illness", "mouth_tape"]);
    expect((await allTags()).find((t) => t.tag === "mouth_tape")).toMatchObject({ label: "Mouth tape", isDefault: false });
    expect(await saveBehaviors({ tags: ["illness", "not_a_behaviour"] })).toMatchObject({ ok: false });
    expect(await shown()).toEqual(["electrolytes", "illness", "mouth_tape"]);
    // The other user's list is untouched.
    const theirs = await db.select().from(journalTags).where(eq(journalTags.userId, other));
    expect(theirs.every((t) => !t.hidden) && theirs.some((t) => t.tag === "mouth_tape")).toBe(false);
    await saveBehaviors({ tags: DEFAULT_JOURNAL_TAGS.map((d) => d.tag) });
    const r = await loadBehaviours();
    expect(r.ok && r.data.tags.find((t) => t.tag === "mouth_tape")).toMatchObject({ hidden: true, section: "nighttime", question: "Wore mouth tape while sleeping?" });
  });
});
