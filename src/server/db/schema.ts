// Conventions: timestamps are integer unix seconds (`*_ts`, `*_at`), days are local `YYYY-MM-DD` text,
// JSON is stored as text (drizzle `mode: "json"`).
//
// drizzle-kit cannot express WITHOUT ROWID, so the initial migration adds it to `hr_samples` and
// `steps_minutes` by hand. A future migration that recreates either table must keep it
// (db/index.test.ts fails otherwise).
import { sql } from "drizzle-orm";
import { blob, check, index, integer, primaryKey, real, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";

const bool = (name: string) => integer(name, { mode: "boolean" });
const json = (name: string) => text(name, { mode: "json" });

/** Single row (id = 1) holding the Google OAuth grant. */
export const oauthTokens = sqliteTable(
  "oauth_tokens",
  {
    id: integer("id").primaryKey(),
    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token").notNull(),
    expiresAt: integer("expires_at").notNull(),
    scope: text("scope").notNull(),
    revokedAt: integer("revoked_at"),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [check("oauth_tokens_single_row", sql`${t.id} = 1`)],
);

/** Per data type (Google type name, or "seed"). `last_error` holds status and code only, never bodies or tokens. */
export const syncState = sqliteTable("sync_state", {
  type: text("type").primaryKey(),
  syncedThrough: integer("synced_through"),
  backfillDaysDone: integer("backfill_days_done"),
  backfillDaysTotal: integer("backfill_days_total"),
  lastAttemptAt: integer("last_attempt_at"),
  lastSuccessAt: integer("last_success_at"),
  lastError: text("last_error"),
});

/** Gzipped raw Google pages; insert with ON CONFLICT DO NOTHING so an unchanged re-fetch is free. */
export const rawPayloads = sqliteTable(
  "raw_payloads",
  {
    id: integer("id").primaryKey(),
    type: text("type").notNull(),
    rangeStart: integer("range_start").notNull(),
    rangeEnd: integer("range_end").notNull(),
    bodyHash: text("body_hash").notNull(),
    gzBody: blob("gz_body", { mode: "buffer" }).notNull(),
    fetchedAt: integer("fetched_at").notNull(),
  },
  (t) => [unique("raw_payloads_dedupe").on(t.type, t.rangeStart, t.rangeEnd, t.bodyHash)],
);

// ponytail: one row per HR sample (~13.6M rows/year at Fitbit's 2 s cadence); add a per-minute rollup if reads get slow.
/** WITHOUT ROWID (see top of file). Band HR only. */
export const hrSamples = sqliteTable("hr_samples", {
  ts: integer("ts").primaryKey(),
  bpm: integer("bpm").notNull(),
});

/** WITHOUT ROWID (see top of file). `ts` is the minute start; max across sources, used for movement gating. */
export const stepsMinutes = sqliteTable("steps_minutes", {
  ts: integer("ts").primaryKey(),
  steps: integer("steps").notNull(),
});

export const dailyMetrics = sqliteTable("daily_metrics", {
  day: text("day").primaryKey(),
  hrvMs: real("hrv_ms"),
  hrvDeepMs: real("hrv_deep_ms"),
  rhrBpm: real("rhr_bpm"),
  rhrMethod: text("rhr_method"),
  respBpm: real("resp_bpm"),
  nightlyTempC: real("nightly_temp_c"),
  spo2Pct: real("spo2_pct"),
  vo2maxDaily: real("vo2max_daily"),
  vo2maxRun: real("vo2max_run"),
  steps: integer("steps"),
  calories: real("calories"),
  weightKg: real("weight_kg"),
  bodyFatPct: real("body_fat_pct"),
  source: text("source").notNull(),
});

/** `day` is the local wake day. Summary minutes are kept even when stages are missing. */
export const sleepSessions = sqliteTable(
  "sleep_sessions",
  {
    id: text("id").primaryKey(),
    day: text("day").notNull(),
    startTs: integer("start_ts").notNull(),
    endTs: integer("end_ts").notNull(),
    isMain: bool("is_main").notNull(),
    processed: bool("processed").notNull(),
    stagesStatus: text("stages_status"),
    asleepMin: integer("asleep_min"),
    awakeMin: integer("awake_min"),
    deepMin: integer("deep_min"),
    lightMin: integer("light_min"),
    remMin: integer("rem_min"),
    source: text("source").notNull(),
  },
  (t) => [index("sleep_sessions_day").on(t.day)],
);

export const sleepSegments = sqliteTable(
  "sleep_segments",
  {
    sessionId: text("session_id")
      .notNull()
      .references(() => sleepSessions.id, { onDelete: "cascade" }),
    startTs: integer("start_ts").notNull(),
    endTs: integer("end_ts").notNull(),
    stage: text("stage", { enum: ["AWAKE", "LIGHT", "DEEP", "REM"] }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.sessionId, t.startTs] })],
);

/** `day` is the local start day. `type` is the Google exercise type (e.g. RUNNING, STRENGTH_TRAINING). */
export const exercises = sqliteTable(
  "exercises",
  {
    id: text("id").primaryKey(),
    day: text("day").notNull(),
    startTs: integer("start_ts").notNull(),
    endTs: integer("end_ts").notNull(),
    type: text("type").notNull(),
    name: text("name"),
    calories: real("calories"),
    distanceM: real("distance_m"),
    source: text("source").notNull(),
  },
  (t) => [index("exercises_day").on(t.day)],
);

export const journalTags = sqliteTable("journal_tags", {
  tag: text("tag").primaryKey(),
  label: text("label").notNull(),
  isDefault: bool("is_default").notNull().default(false),
});

export const journalEntries = sqliteTable(
  "journal_entries",
  {
    day: text("day").notNull(),
    tag: text("tag").notNull(),
    value: integer("value").notNull(),
  },
  (t) => [primaryKey({ columns: [t.day, t.tag] })],
);

/** Days whose HR or steps changed; stage 1 of the pipeline recomputes them, then clears the row. */
export const intradayDirty = sqliteTable("intraday_dirty", {
  day: text("day").primaryKey(),
});

/** One row per day. Stage-1 columns (intraday) and stage-2 columns (folds) are written separately. */
export const dailyScores = sqliteTable("daily_scores", {
  day: text("day").primaryKey(),
  scoringVersion: integer("scoring_version").notNull(),
  // Stage 1
  strain: json("strain"),
  activities: json("activities"),
  sessionRhrBpm: real("session_rhr_bpm"),
  // Stage 2
  recovery: json("recovery"),
  sleep: json("sleep"),
  trainingLoad: json("training_load"),
  strainTarget: json("strain_target"),
  sleepPlanner: json("sleep_planner"),
  energyBank: json("energy_bank"),
  stress: json("stress"),
  healthMonitor: json("health_monitor"),
  healthspan: json("healthspan"),
  fitness: json("fitness"),
  journalImpact: json("journal_impact"),
});

/** Per-minute series per day; `kind` e.g. "hr", "stress", "energy_bank", "load". */
export const intradaySeries = sqliteTable(
  "intraday_series",
  {
    day: text("day").notNull(),
    kind: text("kind").notNull(),
    data: json("data").notNull(),
  },
  (t) => [primaryKey({ columns: [t.day, t.kind] })],
);

/** `period` is an ISO week (`2026-W40`) or a month (`2026-10`). */
export const reports = sqliteTable("reports", {
  period: text("period").primaryKey(),
  data: json("data").notNull(),
});
