// Exports the parity fixtures F1 to F6 for pulse-mobile (docs/plans/2026-10-10-003, "Parity contract"), once per
// SCORING_VERSION:
//   pnpm dlx tsx@4.23.15 scripts/export-mobile-fixtures.mts <outDir>
// (tsx is only a transitive dependency here, so `pnpm tsx` finds no binary in a fresh install.)
// F1 mapper rows, F2 the 180-day demo seed as input rows, F3 every score row of the pinned demo database (hashes
// checked against golden.test.ts's GOLDEN), F4 incremental.test.ts's late night for day 200 (checked against a full
// fold), F5 time.ts across time zones and DST, F6 the view models at a fixed now. Any check that fails throws.
// Database columns keep their snake_case names; F3, F4 and F6 are canonical (sorted keys, 10 significant digits).
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire, Module } from "node:module";
import path from "node:path";
import zlib from "node:zlib";

// src/server/testing.ts imports `inject` from vitest, which throws outside a test run. Its only use is the snapshot
// lookup seeded() does; buildSeeded() never calls it, so a stub keeps the helpers usable here unchanged.
const require = createRequire(import.meta.url);
const vitestStub = new Module(require.resolve("vitest"));
vitestStub.exports = { inject: () => undefined };
vitestStub.loaded = true;
require.cache[require.resolve("vitest")] = vitestStub;

const { and, eq } = await import("drizzle-orm");
const { buildSeeded, copyDb, ctxFor, DAY_S, dayAt, dump, NOW, OPTS, PROFILE, TZ, USER } = await import("../src/server/testing");
const { rows, setDb, sql } = await import("../src/server/db");
const { dailyMetrics, sleepSegments, sleepSessions } = await import("../src/server/db/schema");
const { lastRun, recompute, SCORING_VERSION } = await import("../src/server/pipeline");
const map = await import("../src/server/sources/google/map");
const time = await import("../src/server/time");
const { getHome } = await import("../src/server/queries/home");
const { getSleep } = await import("../src/server/queries/sleep");
const { getRecovery } = await import("../src/server/queries/recovery");
const { getStrain } = await import("../src/server/queries/strain");
const { getMetricDetail } = await import("../src/server/queries/metric");
type Db = Awaited<ReturnType<typeof buildSeeded>>;
type Row = Record<string, unknown>;
const without = (r: Row, key: string) => Object.fromEntries(Object.entries(r).filter(([k]) => k !== key));

const outDir = process.argv[2];
if (!outDir) throw new Error("usage: pnpm dlx tsx@4.23.15 scripts/export-mobile-fixtures.mts <outDir>");
fs.mkdirSync(outDir, { recursive: true });

const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim();
const generatedFrom = `pulse ${git("rev-parse", "HEAD")}${git("status", "--porcelain") ? "-dirty" : ""}`;
const stamp = { generatedFrom, scoringVersion: SCORING_VERSION };

// canon and hash exactly as src/server/pipeline/golden.test.ts has them.
const canon = (v: unknown): unknown =>
  typeof v === "number"
    ? +v.toPrecision(10)
    : Array.isArray(v)
      ? v.map(canon)
      : v && typeof v === "object"
        ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon((v as Record<string, unknown>)[k])]))
        : v;
const hash = (rs: Record<string, unknown>[]) =>
  crypto
    .createHash("sha256")
    .update(rs.map((r) => Object.values(r).map((v) => JSON.stringify(canon(v))).join("\t")).join("\n"))
    .digest("hex")
    .slice(0, 16);

/** golden.test.ts's fingerprints(), on the database. */
async function fingerprints(db: Db) {
  const out: Record<string, string> = {};
  const columns = await rows<{ name: string }>(
    db,
    sql`select column_name as name from information_schema.columns
        where table_name = 'daily_scores' and column_name not in ('day', 'user_id') order by ordinal_position`,
  );
  for (const { name } of columns) {
    out[`daily_scores.${name}`] = hash(await rows(db, sql`select day, ${sql.identifier(name)} from daily_scores where user_id = ${USER} order by day`));
  }
  const kinds = await rows<{ kind: string }>(db, sql`select distinct kind from intraday_series where user_id = ${USER} order by kind`);
  for (const { kind } of kinds) {
    out[`intraday_series.${kind}`] = hash(await rows(db, sql`select day, data from intraday_series where user_id = ${USER} and kind = ${kind} order by day`));
  }
  out.reports = hash(await rows(db, sql`select period, data from reports where user_id = ${USER} order by period`));
  return out;
}

type ScoreRows = { daily_scores: Row[]; intraday_series: Row[]; reports: Row[] };

/** Every score row, canonical, in the order fingerprints() hashes them. */
async function scoreRows(db: Db): Promise<ScoreRows> {
  const strip = (rs: Row[]) => rs.map((r) => canon(without(r, "user_id")) as Row);
  return {
    daily_scores: strip(await rows(db, sql`select * from daily_scores where user_id = ${USER} order by day`)),
    intraday_series: strip(await rows(db, sql`select * from intraday_series where user_id = ${USER} order by kind, day`)),
    reports: strip(await rows(db, sql`select * from reports where user_id = ${USER} order by period`)),
  };
}

/** The same fingerprints, from exported rows after a JSON round trip: what pulse-mobile's test computes. */
function rowHashes(exported: ScoreRows) {
  const r = JSON.parse(JSON.stringify(exported)) as ScoreRows;
  const out: Record<string, string> = {};
  for (const name of Object.keys(r.daily_scores[0] ?? {}).filter((k) => k !== "day").sort())
    out[`daily_scores.${name}`] = hash(r.daily_scores.map((x) => ({ day: x.day, [name]: x[name] })));
  for (const kind of [...new Set(r.intraday_series.map((x) => x.kind as string))].sort())
    out[`intraday_series.${kind}`] = hash(r.intraday_series.filter((x) => x.kind === kind).map((x) => ({ day: x.day, data: x.data })));
  out.reports = hash(r.reports.map((x) => ({ period: x.period, data: x.data })));
  return out;
}

/** GOLDEN[SCORING_VERSION] read from golden.test.ts's source (the table is not exported). */
function golden(): Record<string, string> {
  const src = fs.readFileSync(path.resolve(import.meta.dirname, "../src/server/pipeline/golden.test.ts"), "utf8");
  const block = src.match(new RegExp(`\\n  ${SCORING_VERSION}: \\{\\n([\\s\\S]*?)\\n  \\},`))?.[1];
  if (!block) throw new Error(`golden.test.ts has no GOLDEN[${SCORING_VERSION}]`);
  return Object.fromEntries([...block.matchAll(/"?([\w.]+)"?: "([0-9a-f]{16})"/g)].map((m) => [m[1], m[2]]));
}

function assertSame(what: string, actual: Record<string, string>, expected: Record<string, string>) {
  const keys = [...new Set([...Object.keys(actual), ...Object.keys(expected)])].sort();
  const diff = keys.filter((k) => actual[k] !== expected[k]).map((k) => `  ${k}: got ${actual[k]}, expected ${expected[k]}`);
  if (diff.length) throw new Error(`${what} differ:\n${diff.join("\n")}`);
}

/**
 * Every input table the seed fills (anything with a user_id that is not a score, the fold checkpoint, or auth, Google
 * or coach state), without user_id, in primary-key order.
 */
const DERIVED_OR_UNUSED = new Set([
  "daily_scores", "intraday_series", "reports", "fold_checkpoints", "session", "account", "oauth_tokens", "raw_payloads",
  "avatars", "coach_settings", "coach_chats", "push_subscriptions",
]);
async function inputRows(db: Db) {
  const tables = await rows<{ t: string }>(
    db,
    sql`select table_name t from information_schema.columns where table_schema = 'public' and column_name = 'user_id' order by table_name`,
  );
  const out: Record<string, Row[]> = {};
  for (const { t } of tables.filter(({ t }) => !DERIVED_OR_UNUSED.has(t))) {
    const pk = await rows<{ c: string }>(
      db,
      sql`select a.attname c from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
          where i.indrelid = ${t}::regclass and i.indisprimary order by array_position(i.indkey, a.attnum)`,
    );
    const order = sql.join(pk.map(({ c }) => sql.identifier(c)), sql`, `);
    out[t] = (await rows<Row>(db, sql`select * from ${sql.identifier(t)} where user_id = ${USER} order by ${order}`)).map((r) => without(r, "user_id"));
  }
  return out;
}

const written: { file: string; bytes: number }[] = [];
function write(name: string, data: unknown) {
  const text = JSON.stringify(data);
  const gz = text.length > 40 * 1024 * 1024;
  const file = path.join(outDir, gz ? `${name}.gz` : name);
  fs.rmSync(path.join(outDir, gz ? name : `${name}.gz`), { force: true });
  fs.writeFileSync(file, gz ? zlib.gzipSync(text) : text);
  written.push({ file, bytes: fs.statSync(file).size });
  console.log(`wrote ${file} (${fs.statSync(file).size} bytes)`);
}

// ── F1: Google mappers ─────────────────────────────────────────────────────────────────────────────
{
  const MAPPER_TZ = "Asia/Kolkata"; // as map.test.ts
  const dir = path.resolve(import.meta.dirname, "../src/server/sources/google/__fixtures__");
  const cases: { file: string; mapper: string; args: Record<string, string>; rows: unknown; payload: unknown }[] = [];
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
    const payload = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
    const points: unknown[] = payload.dataPoints ?? payload.rollupDataPoints ?? [];
    const type = file.replace(/(\.dailyRollUp)?\.json$/, "");
    const add = (mapper: string, args: Record<string, string>, out: unknown) =>
      cases.push({ file, mapper, args, rows: out instanceof Map ? [...out] : out, payload });
    if (file.includes(".dailyRollUp.")) add("mapRollup", { type }, map.mapRollup(type as never, points));
    else if ((map.DAILY_TYPES as string[]).includes(type)) {
      add("mapDaily", { type, tz: MAPPER_TZ }, map.mapDaily(type as never, points, MAPPER_TZ));
      if (type === "weight" || type === "body-fat") add("mapLogEntries", { type, tz: MAPPER_TZ }, map.mapLogEntries(type, points, MAPPER_TZ));
    } else if (type === "heart-rate") add("mapHeartRate", {}, map.mapHeartRate(points));
    else if (type === "steps") add("mapStepsMinutes", {}, map.mapStepsMinutes(points));
    else if (type === "sleep") add("mapSleep", { tz: MAPPER_TZ }, map.mapSleep(points, MAPPER_TZ));
    else if (type === "exercise") add("mapExercises", { tz: MAPPER_TZ }, map.mapExercises(points, MAPPER_TZ));
    else throw new Error(`F1: no mapper known for ${file}`);
  }
  write("f1-mappers.json", {
    ...stamp,
    note: "rows are each mapper's return value; a Map (mapHeartRate, mapStepsMinutes) is its [key, value] entries in insertion order. points = payload.dataPoints ?? payload.rollupDataPoints ?? []",
    cases,
  });
}

// ── F2 and F3: the pinned demo database, as golden.test.ts builds it (buildSeeded: seed at NOW, then recompute) ──
const demo = await buildSeeded([NOW], { compute: false });
const options = { userId: USER, timeZone: TZ, profile: PROFILE, now: NOW, seedNows: [NOW] };
write("f2-seed.json", {
  ...stamp,
  note: "input rows after seedPull at `now`, before any recompute; the test database has no profile row: the pipeline gets `profile` as an option",
  options,
  tables: await inputRows(demo),
});
await recompute(demo, OPTS);
const pinned = golden();
assertSame("F3 database hashes vs GOLDEN", await fingerprints(demo), pinned);
const f3 = await scoreRows(demo);
const f3Hashes = rowHashes(f3);
assertSame("F3 exported-row hashes vs GOLDEN", f3Hashes, pinned);
write("f3-scores.json", { ...stamp, options, hashes: f3Hashes, ...f3 });

// ── F4: incremental.test.ts, "a late night for day 200 then an incremental recompute matches a from-scratch recompute" ──
{
  const seedNows = [NOW - 40 * DAY_S, NOW];
  const base = await buildSeeded(seedNows, { compute: false });
  const seed = await inputRows(base);
  const metricDays = seed.daily_metrics.map((r) => r.day as string);
  if (metricDays.length !== 220) throw new Error(`F4: expected 220 metric days, got ${metricDays.length}`);
  const full = await copyDb(base);
  const late = await copyDb(base);
  const at = (i: number) => new Date(Date.parse(metricDays[0]) + i * DAY_S * 1000).toISOString().slice(0, 10);
  const day = at(200);

  const s = sleepSessions;
  const m = dailyMetrics;
  const [session] = await late.select().from(s).where(and(eq(s.userId, USER), eq(s.day, day), eq(s.isMain, true)));
  const segments = await late.select().from(sleepSegments).where(and(eq(sleepSegments.userId, USER), eq(sleepSegments.sessionId, session.id)));
  const [metrics] = await late
    .select({ hrvMs: m.hrvMs, hrvDeepMs: m.hrvDeepMs, rhrBpm: m.rhrBpm, rhrMethod: m.rhrMethod, respBpm: m.respBpm, nightlyTempC: m.nightlyTempC, spo2Pct: m.spo2Pct })
    .from(m)
    .where(and(eq(m.userId, USER), eq(m.day, day)));
  await late.delete(s).where(and(eq(s.userId, USER), eq(s.id, session.id)));
  await late.delete(sleepSegments).where(and(eq(sleepSegments.userId, USER), eq(sleepSegments.sessionId, session.id)));
  const cleared = Object.fromEntries(Object.keys(metrics).map((k) => [k, null]));
  await late.update(m).set(cleared).where(and(eq(m.userId, USER), eq(m.day, day)));
  await recompute(late, OPTS);
  const [held] = await rows<{ v: { reason: string } }>(late, sql`select recovery v from daily_scores where user_id = ${USER} and day = ${day}`);
  if (held.v.reason !== "band_not_worn") throw new Error(`F4: recovery reason while held back is ${held.v.reason}`);

  await late.insert(s).values(session);
  if (segments.length) await late.insert(sleepSegments).values(segments);
  await late.update(m).set(metrics).where(and(eq(m.userId, USER), eq(m.day, day)));
  await recompute(late, OPTS);
  const startedBefore = session.startTs < time.localMidnight(day, TZ);
  const stage1Days = [...lastRun.stage1Days];
  const stage2Days = lastRun.stage2Days;
  if (JSON.stringify(stage1Days) !== JSON.stringify(startedBefore ? [at(199), day] : [day])) throw new Error(`F4: stage 1 reran ${stage1Days}`);
  if (stage2Days !== 220 - 189) throw new Error(`F4: stage 2 replayed ${stage2Days} days, expected 31`);
  const ck = await rows<{ day: string }>(late, sql`select day from fold_checkpoints where user_id = ${USER}`);
  if (ck.length !== 1 || ck[0].day !== at(188)) throw new Error(`F4: checkpoint ${JSON.stringify(ck)}, expected ${at(188)}`);

  await recompute(full, OPTS);
  for (const [t, order] of [["daily_scores", "1, 2"], ["intraday_series", "1, 2, 3"], ["reports", "1, 2"]]) {
    if ((await dump(late, t, order)) !== (await dump(full, t, order))) throw new Error(`F4: ${t} after the incremental recompute differs from a full fold`);
  }
  const lateRows = await scoreRows(late);
  const hashes = rowHashes(lateRows);
  assertSame("F4 incremental vs full-fold hashes", hashes, rowHashes(await scoreRows(full)));
  assertSame("F4 database vs exported-row hashes", await fingerprints(late), hashes);

  // The change in the seed's snake_case column names.
  const snake = (r: Row) => Object.fromEntries(Object.entries(without(r, "userId")).map(([k, v]) => [k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`), v]));
  write("f4-incremental.json", {
    ...stamp,
    note:
      "seed (input rows after seedPull at each of seedNows, same layout as F2) -> hold back the main night of change.day (delete the session and its segments, set change.metrics' columns to null) -> recompute (recovery reason band_not_worn) -> restore the night -> recompute incrementally. rows equal a from-scratch recompute of seed.",
    options: { userId: USER, timeZone: TZ, profile: PROFILE, now: NOW, seedNows },
    seed,
    change: { day, dayIndex: 200, session: snake(session), segments: segments.map(snake), metrics: snake(metrics) },
    heldBackRecoveryReason: held.v.reason,
    incremental: { stage1Days, stage2Days, checkpointDay: ck[0].day },
    equalsFullFold: true,
    hashes,
    ...lateRows,
  });
}

// ── F5: time.ts, the days time.test.ts's checkZone walks in each of its zones ──────────────────────
{
  const ZONES = [
    "UTC", "Asia/Kolkata", "Asia/Kathmandu", "America/St_Johns", "Europe/London", "America/New_York", "America/Santiago",
    "America/Havana", "Atlantic/Azores", "Asia/Amman", "Australia/Lord_Howe", "Pacific/Chatham",
  ];
  const f5 = {
    ...stamp,
    wall: [] as { tz: string; s: number; day: string; time: string; asUtc: number }[],
    localMidnight: [] as { tz: string; day: string; s: number }[],
    fromWall: [] as { tz: string; civil: string; s: number }[],
    localMinutes: [] as { tz: string; s: number; minutes: number }[],
    utcOffsetS: [] as { tz: string; s: number; offset: number }[],
  };
  const civilOf = (wallS: number) => {
    const iso = new Date(wallS * 1000).toISOString();
    return wallS % 60 ? iso.slice(0, 19) : iso.slice(0, 16);
  };
  for (const tz of ZONES) {
    const offset = (s: number) => time.utcOffsetS(s, tz);
    // checkZone's walk: every day around each offset change in 2020-2030, and every 30th day.
    const days = new Set<string>();
    const transitionDays = new Set<string>();
    const noonOffset = (d: string) => offset(Date.parse(`${d}T12:00:00Z`) / 1000);
    let today = noonOffset("2020-01-01");
    for (let d = "2020-01-01", i = 0; d <= "2030-12-31"; d = time.addDays(d, 1), i++) {
      const tomorrow = noonOffset(time.addDays(d, 1));
      if (today !== tomorrow) {
        for (let k = -1; k <= 2; k++) {
          days.add(time.addDays(d, k));
          transitionDays.add(time.addDays(d, k));
        }
      } else if (i % 30 === 0) days.add(d);
      today = tomorrow;
    }
    const instants = new Set<number>();
    const civils = new Set<string>();
    for (const d of [...days].sort()) {
      const mid = time.localMidnight(d, tz);
      const next = time.localMidnight(time.addDays(d, 1), tz);
      f5.localMidnight.push({ tz, day: d, s: mid });
      for (const s of [mid, mid - 1, Date.parse(`${d}T12:00:00Z`) / 1000, next - 60]) instants.add(s);
      civils.add(`${d}T00:00`).add(`${d}T12:00`);
      // An offset change inside [mid - 1, next - 1]: the wall times it skips (gap) or repeats, and both edges.
      if (!transitionDays.has(d) || offset(mid - 1) === offset(next - 1)) continue;
      let lo = mid - 1;
      let hi = next - 1;
      while (hi - lo > 1) {
        const x = Math.floor((lo + hi) / 2);
        if (offset(x) === offset(mid - 1)) lo = x;
        else hi = x;
      }
      const [before, after] = [offset(lo), offset(hi)];
      const [a, b] = [hi + Math.min(before, after), hi + Math.max(before, after)]; // the skipped or repeated wall span
      for (const w of [a - 60, a, a + Math.floor((b - a) / 120) * 60, b - 60, b]) civils.add(civilOf(w));
      instants.add(lo).add(hi);
    }
    for (const s of [...instants].sort((x, y) => x - y)) {
      f5.wall.push({ tz, s, ...time.wall(s, tz) });
      f5.localMinutes.push({ tz, s, minutes: time.localMinutes(s, tz) });
      f5.utcOffsetS.push({ tz, s, offset: time.utcOffsetS(s, tz) });
    }
    for (const civil of [...civils].sort()) f5.fromWall.push({ tz, civil, s: time.fromWall(civil, tz) });
  }
  write("f5-time.json", f5);
  console.log(`F5: ${f5.wall.length} wall, ${f5.localMidnight.length} localMidnight, ${f5.fromWall.length} fromWall, ${f5.localMinutes.length} localMinutes, ${f5.utcOffsetS.length} utcOffsetS`);
}

// ── F6: view models on the F3 database at NOW ───────────────────────────────────────────────────────
{
  setDb(demo);
  const ctx = ctxFor(demo);
  const days = [dayAt(7), dayAt(90), dayAt(156), dayAt(179)];
  const metricKeys = ["steps", "hrv", "rhr", "skin", "weight", "distance"] as const;
  const cases: { query: string; vm: string; key?: string; day: string; value: unknown }[] = [];
  for (const day of days) {
    cases.push({ query: "getHome", vm: "HomeVM", day, value: canon(await getHome(day, ctx)) });
    cases.push({ query: "getSleep", vm: "SleepVM", day, value: canon(await getSleep(day, ctx)) });
    cases.push({ query: "getRecovery", vm: "RecoveryVM", day, value: canon(await getRecovery(day, ctx)) });
    cases.push({ query: "getStrain", vm: "StrainVM", day, value: canon(await getStrain(day, ctx)) });
    for (const key of metricKeys) cases.push({ query: "getMetricDetail", vm: "MetricDetailVM", key, day, value: canon(await getMetricDetail(key, day, ctx)) });
  }
  write("f6-viewmodels.json", {
    ...stamp,
    note: "each value is the query's result on the F2 seed recomputed (the F3 rows), canonical; ctx is testing.ts's ctxFor(db)",
    ctx: { userId: ctx.userId, timeZone: ctx.timeZone, profile: ctx.profile, mode: ctx.mode, now: ctx.now },
    days,
    metricKeys,
    cases,
  });
  console.log(`F6: ${cases.length} view models`);
}

console.log(`F3 hashes equal GOLDEN[${SCORING_VERSION}]; F4 incremental equals a full fold. ${generatedFrom}`);
for (const w of written) console.log(`${w.file}\t${w.bytes}`);
// The PGlite instances keep the event loop alive.
process.exit(0);
