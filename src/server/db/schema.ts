// PostgreSQL schema. Conventions: timestamps are unix seconds (`bigint`, `*_ts`, `*_at`), days are local
// `YYYY-MM-DD` (`date`, string mode), JSON is `jsonb`, floats are `double precision` (Postgres `real` is 4-byte).
//
// Auth tables come from better-auth (`npx auth@latest generate` for the Drizzle adapter, serial ids). Every other
// table belongs to one user: `user_id` leads its key and cascades when the account is deleted.
import { relations } from "drizzle-orm";
import { bigint, boolean, customType, foreignKey, date, doublePrecision, index, integer, jsonb, pgTable, primaryKey, serial, smallint, text, timestamp, unique } from "drizzle-orm/pg-core";

/** drizzle 0.45 has no bytea column; Buffers in and out. */
const bytea = customType<{ data: Buffer; driverData: Buffer | Uint8Array }>({
  dataType: () => "bytea",
  fromDriver: (v) => (Buffer.isBuffer(v) ? v : Buffer.from(v)),
});

// ── better-auth ──────────────────────────────────────────────────────────────

export const user = pgTable("user", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
  username: text("username").unique(),
  displayUsername: text("display_username"),
  /** Pulse's own column, not better-auth's: `admin` opens the admin panel (/admin), as do the ADMIN_EMAILS accounts. */
  role: text("role", { enum: ["user", "admin"] }).default("user").notNull(),
  /** Pulse's own column: an admin picked this account for the coach (admin panel, Coach = chosen accounts). */
  coachAllowed: boolean("coach_allowed").default(false).notNull(),
});

export const session = pgTable(
  "session",
  {
    id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: integer("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_userId_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: integer("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [index("account_userId_idx").on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

export const rateLimit = pgTable("rate_limit", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

export const userRelations = relations(user, ({ many }) => ({ sessions: many(session), accounts: many(account) }));
export const sessionRelations = relations(session, ({ one }) => ({ user: one(user, { fields: [session.userId], references: [user.id] }) }));
export const accountRelations = relations(account, ({ one }) => ({ user: one(user, { fields: [account.userId], references: [user.id] }) }));

// ── Per user ─────────────────────────────────────────────────────────────────

const userId = () =>
  integer("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" });
const ts = (name: string) => bigint(name, { mode: "number" });
const day = (name: string) => date(name, { mode: "string" });
const real = (name: string) => doublePrecision(name);

/** The user's Google OAuth grant, and which Google account it is (from the ID token at each connect). */
export const oauthTokens = pgTable("oauth_tokens", {
  userId: userId().primaryKey(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  expiresAt: ts("expires_at").notNull(),
  scope: text("scope").notNull(),
  revokedAt: ts("revoked_at"),
  updatedAt: ts("updated_at").notNull(),
  googleEmail: text("google_email"),
  googleName: text("google_name"),
  googlePicture: text("google_picture"),
});

/** Per data type (Google type name, or "seed"). `last_error` holds status and code only, never bodies or tokens. */
export const syncState = pgTable(
  "sync_state",
  {
    userId: userId(),
    type: text("type").notNull(),
    syncedThrough: ts("synced_through"),
    backfillDaysDone: integer("backfill_days_done"),
    backfillDaysTotal: integer("backfill_days_total"),
    lastAttemptAt: ts("last_attempt_at"),
    lastSuccessAt: ts("last_success_at"),
    lastError: text("last_error"),
  },
  (t) => [primaryKey({ columns: [t.userId, t.type] })],
);

/** Gzipped raw Google pages; insert with ON CONFLICT DO NOTHING so an unchanged re-fetch is free. Pruned by fetched_at. */
export const rawPayloads = pgTable(
  "raw_payloads",
  {
    id: serial("id").primaryKey(),
    userId: userId(),
    type: text("type").notNull(),
    rangeStart: ts("range_start").notNull(),
    rangeEnd: ts("range_end").notNull(),
    bodyHash: text("body_hash").notNull(),
    gzBody: bytea("gz_body").notNull(),
    fetchedAt: ts("fetched_at").notNull(),
  },
  (t) => [unique("raw_payloads_dedupe").on(t.userId, t.type, t.rangeStart, t.rangeEnd, t.bodyHash), index("raw_payloads_fetched_at").on(t.fetchedAt)],
);

/**
 * Band heart rate, one row per user and UTC day (`bucket` = floor(ts / 86400)): second-of-day offsets and bpm, sorted
 * by offset. UTC buckets, so a time-zone change never re-buckets stored samples. Read and merged by src/server/samples.ts.
 */
export const hrDays = pgTable(
  "hr_days",
  {
    userId: userId(),
    bucket: integer("bucket").notNull(),
    offsets: integer("offsets").array().notNull(),
    values: smallint("values").array().notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.bucket] })],
);

/** Steps per minute (offset = the minute start's second-of-day), same layout as hr_days. Max across sources. */
export const stepsDays = pgTable(
  "steps_days",
  {
    userId: userId(),
    bucket: integer("bucket").notNull(),
    offsets: integer("offsets").array().notNull(),
    values: integer("values").array().notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.bucket] })],
);

export const dailyMetrics = pgTable(
  "daily_metrics",
  {
    userId: userId(),
    day: day("day").notNull(),
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
    /** Google's heart-rate zones for the day: `[light, moderate, vigorous, peak]` minimum bpm, then the peak maximum. */
    hrZones: jsonb("hr_zones").$type<number[]>(),
    /** Google's all-day time in heart-rate zones, minutes: LIGHT + MODERATE, and VIGOROUS + PEAK. */
    lightModerateMin: real("light_moderate_min"),
    vigorousPeakMin: real("vigorous_peak_min"),
    /** Google's skin-temperature baseline (30-night median) and the 30-night SD of nightly − baseline, °C. */
    tempBaselineC: real("temp_baseline_c"),
    tempSdC: real("temp_sd_c"),
    rhrRangeLow: real("rhr_range_low"),
    rhrRangeHigh: real("rhr_range_high"),
    hrvRangeLow: real("hrv_range_low"),
    hrvRangeHigh: real("hrv_range_high"),
    source: text("source").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.day] })],
);

/** `day` is the local wake day. Summary minutes are kept even when stages are missing. */
export const sleepSessions = pgTable(
  "sleep_sessions",
  {
    userId: userId(),
    id: text("id").notNull(),
    day: day("day").notNull(),
    startTs: ts("start_ts").notNull(),
    endTs: ts("end_ts").notNull(),
    isMain: boolean("is_main").notNull(),
    processed: boolean("processed").notNull(),
    stagesStatus: text("stages_status"),
    asleepMin: integer("asleep_min"),
    awakeMin: integer("awake_min"),
    deepMin: integer("deep_min"),
    lightMin: integer("light_min"),
    remMin: integer("rem_min"),
    source: text("source").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.id] }), index("sleep_sessions_day").on(t.userId, t.day)],
);

export const sleepSegments = pgTable(
  "sleep_segments",
  {
    userId: userId(),
    sessionId: text("session_id").notNull(),
    startTs: ts("start_ts").notNull(),
    endTs: ts("end_ts").notNull(),
    stage: text("stage", { enum: ["awake", "light", "deep", "rem"] }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.sessionId, t.startTs] }),
    foreignKey({ columns: [t.userId, t.sessionId], foreignColumns: [sleepSessions.userId, sleepSessions.id] }).onDelete("cascade"),
  ],
);

/** `day` is the local start day. `type` is the Google exercise type (e.g. RUNNING, STRENGTH_TRAINING). */
export const exercises = pgTable(
  "exercises",
  {
    userId: userId(),
    id: text("id").notNull(),
    day: day("day").notNull(),
    startTs: ts("start_ts").notNull(),
    endTs: ts("end_ts").notNull(),
    type: text("type").notNull(),
    name: text("name"),
    calories: real("calories"),
    distanceM: real("distance_m"),
    source: text("source").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.id] }), index("exercises_day").on(t.userId, t.day)],
);

export const journalTags = pgTable(
  "journal_tags",
  {
    userId: userId(),
    tag: text("tag").notNull(),
    label: text("label").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    /** Hidden from the check-in sheet (More › Behaviours). Past answers stay and still count in insights. */
    hidden: boolean("hidden").notNull().default(false),
    /** Order within the tag's check-in group; ties fall back to `seq` (insertion order). */
    position: integer("position").notNull().default(0),
    seq: serial("seq").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.tag] })],
);

/** Google's daily roll-ups beyond the scored metrics, one row per local day and metric key. Shown, never scored. */
export const dailyValues = pgTable(
  "daily_values",
  {
    userId: userId(),
    day: text("day").notNull(), // a date, or 'latest' for height_cm
    key: text("key").notNull(),
    value: real("value").notNull(),
  },
  // The key index serves "every reading of one measurement" (Health › measurements, metric trends).
  (t) => [primaryKey({ columns: [t.userId, t.day, t.key] }), index("daily_values_key").on(t.userId, t.key, t.day)],
);

/** Heart-rhythm records (ECG readings, irregular rhythm notifications), one row per Google data point. */
export const healthRecords = pgTable(
  "health_records",
  {
    userId: userId(),
    id: text("id").notNull(),
    kind: text("kind", { enum: ["ecg", "irn"] }).notNull(),
    ts: ts("ts").notNull(),
    day: day("day").notNull(),
    /** ECG: classification and average bpm. IRN: alert window count. Never the waveform. */
    data: jsonb("data").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.id] }), index("health_records_ts").on(t.userId, t.ts)],
);

/** Home's My Dashboard as the user chose it: the metric keys shown, in `position` order. No rows means the default list. */
export const dashboardMetrics = pgTable(
  "dashboard_metrics",
  {
    userId: userId(),
    key: text("key").notNull(),
    position: integer("position").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.key] })],
);

export const journalEntries = pgTable(
  "journal_entries",
  {
    userId: userId(),
    day: day("day").notNull(),
    tag: text("tag").notNull(),
    value: integer("value").notNull(),
    /** The follow-up answer for a "yes" (src/lib/behaviors.ts): minutes after midnight or a count. Null when not asked or skipped. */
    detail: integer("detail"),
  },
  (t) => [primaryKey({ columns: [t.userId, t.day, t.tag] })],
);

/** The journal's free-text note for a day (journal-02). No row means no note. */
export const journalNotes = pgTable(
  "journal_notes",
  {
    userId: userId(),
    day: day("day").notNull(),
    text: text("text").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.day] })],
);

/** Days whose HR or steps changed; stage 1 of the pipeline recomputes them, then clears the row. */
export const intradayDirty = pgTable(
  "intraday_dirty",
  {
    userId: userId(),
    day: day("day").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.day] })],
);

/** One row per day. Stage-1 columns (intraday) and stage-2 columns (folds) are written separately. */
export const dailyScores = pgTable(
  "daily_scores",
  {
    userId: userId(),
    day: day("day").notNull(),
    scoringVersion: integer("scoring_version").notNull(),
    // Stage 1
    strain: jsonb("strain"),
    activities: jsonb("activities"),
    sessionRhrBpm: real("session_rhr_bpm"),
    // Stage 2
    recovery: jsonb("recovery"),
    sleep: jsonb("sleep"),
    trainingLoad: jsonb("training_load"),
    strainTarget: jsonb("strain_target"),
    sleepPlanner: jsonb("sleep_planner"),
    energyBank: jsonb("energy_bank"),
    stress: jsonb("stress"),
    healthMonitor: jsonb("health_monitor"),
    healthspan: jsonb("healthspan"),
    fitness: jsonb("fitness"),
    journalImpact: jsonb("journal_impact"),
  },
  (t) => [primaryKey({ columns: [t.userId, t.day] })],
);

/** Per-minute series per day; `kind` e.g. "hr", "stress", "energy_bank", "load". */
export const intradaySeries = pgTable(
  "intraday_series",
  {
    userId: userId(),
    day: day("day").notNull(),
    kind: text("kind").notNull(),
    data: jsonb("data").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.day, t.kind] })],
);

/** `period` is an ISO week (`2026-W40`) or a month (`2026-10`). */
export const reports = pgTable(
  "reports",
  {
    userId: userId(),
    period: text("period").notNull(),
    data: jsonb("data").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.period] })],
);

/** What scoring needs about the person. Absent until onboarding (the demo user's is seeded). */
/**
 * Sign-up invites from the admin panel. Only the token's SHA-256 is stored, so the link is shown once. Not per user:
 * an invite outlives the admin who made it, and keeps who used it until that account is deleted.
 */
export const invites = pgTable("invites", {
  id: serial("id").primaryKey(),
  tokenHash: text("token_hash").notNull().unique(),
  /** Who it is for, as the admin typed it ("Sam"). */
  label: text("label"),
  createdBy: integer("created_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: ts("created_at").notNull(),
  expiresAt: ts("expires_at").notNull(),
  usedAt: ts("used_at"),
  usedBy: integer("used_by").references(() => user.id, { onDelete: "set null" }),
});

/** Server-wide settings an admin changes from the panel, one row per key. Unset keys fall back to the environment. */
export const serverSettings = pgTable("server_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const profile = pgTable("profile", {
  userId: userId().primaryKey(),
  birthDate: date("birth_date", { mode: "string" }).notNull(),
  sex: text("sex", { enum: ["male", "female"] }).notNull(),
  /** Measured max HR; null means estimate it from age. */
  maxHr: integer("max_hr"),
  heightCm: real("height_cm"),
  /** IANA zone the person lives in: their days start at local midnight there. Chosen at onboarding. */
  timeZone: text("time_zone").notNull(),
  updatedAt: ts("updated_at").notNull(),
});

/** A photo uploaded in Settings; it wins over the Google one. */
export const avatars = pgTable("avatars", {
  userId: userId().primaryKey(),
  bytes: bytea("bytes").notNull(),
  type: text("type").notNull(),
  updatedAt: ts("updated_at").notNull(),
});

/**
 * What the user logged in Pulse (water, food, weight, mood, symptoms, cycle), one row per Google data point.
 * `google_name` is the data point's name at Google (null: kept locally only, as in demo mode).
 */
export const loggedEntries = pgTable(
  "logged_entries",
  {
    userId: userId(),
    id: text("id").notNull(),
    type: text("type").notNull(),
    ts: ts("ts").notNull(),
    day: day("day").notNull(),
    data: jsonb("data").notNull(),
    googleName: text("google_name"),
    createdAt: ts("created_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.id] }), index("logged_entries_ts").on(t.userId, t.ts), index("logged_entries_day_type").on(t.userId, t.day, t.type)],
);

/**
 * The coach, per user: consent, the AI provider and model they chose, and their API key encrypted
 * (src/server/coach/crypto.ts; never sent to the browser or exported). `key_last4` is all Settings shows.
 */
export const coachSettings = pgTable("coach_settings", {
  userId: userId().primaryKey(),
  consentAt: ts("consent_at"),
  provider: text("provider"),
  model: text("model"),
  keyCiphertext: bytea("key_ciphertext"),
  keyLast4: text("key_last4"),
  /** The user's own notes on how the coach should talk to them (max 500 characters); appended under the rules. */
  customInstructions: text("custom_instructions"),
  /** Minutes after local midnight to send the "brief ready" notification; null = off. */
  briefMinute: integer("brief_minute"),
  /** The last local day that notification went out. */
  lastBriefDay: text("last_brief_day"),
  updatedAt: ts("updated_at").notNull(),
});

/**
 * The coach's wording as edited in the admin dashboard (src/server/coach/texts.ts): one row per saved version of a
 * key (`instructions`, `tool.<name>`, `tool.<name>.<param>`); the newest row per key is in use. Server-wide.
 */
export const coachPrompts = pgTable(
  "coach_prompts",
  {
    id: serial("id").primaryKey(),
    key: text("key").notNull(),
    body: text("body").notNull(),
    createdBy: integer("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: ts("created_at").notNull(),
  },
  (t) => [index("coach_prompts_key").on(t.key, t.id)],
);

/** Coach chats: the AI SDK's UIMessage[] as validated and saved by /api/coach. */
export const coachChats = pgTable(
  "coach_chats",
  {
    userId: userId(),
    id: text("id").notNull(),
    title: text("title").notNull(),
    messages: jsonb("messages").notNull(),
    createdAt: ts("created_at").notNull(),
    updatedAt: ts("updated_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.id] }), index("coach_chats_recent").on(t.userId, t.updatedAt)],
);

/** One row per browser the user turned notifications on in. `last_*_day` dedupe the daily alerts (local YYYY-MM-DD). */
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    userId: userId(),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    createdAt: ts("created_at").notNull(),
    lastRecoveryDay: day("last_recovery_day"),
    lastSyncAlertDay: day("last_sync_alert_day"),
  },
  (t) => [primaryKey({ columns: [t.userId, t.endpoint] })],
);

/** Tables holding a user's synced Google data and what was computed from it (cleared on a Google account switch). */
export const SYNCED_TABLES = [
  syncState, rawPayloads, hrDays, stepsDays, dailyMetrics, sleepSegments, sleepSessions, exercises, dailyValues,
  healthRecords, intradayDirty, dailyScores, intradaySeries, reports,
] as const;

