// More, Settings and the shell's status (spec §7.14, §4.2). Pages also call worker.requestSync() on load.
import { SCORING_VERSION } from "../pipeline";
import { addDays, wholeYears } from "../time";
import { defaultCtx, firstDay, type QueryCtx, todayOf } from "./common";
import { latestReport } from "./home";
import type { MoreVM, SettingsVM, ShellStatusVM } from "./types";

export { requestSync } from "../worker";

export const APP_VERSION = "0.1.0";
const STALE_MS = 2 * 3600_000;

/** Google sync jobs grouped as Settings lists them. */
const GROUPS: { key: string; label: string; types: string[] }[] = [
  { key: "heart-rate", label: "Heart rate", types: ["heart-rate"] },
  { key: "steps", label: "Steps", types: ["steps", "steps-daily"] },
  { key: "sleep", label: "Sleep", types: ["sleep"] },
  { key: "hrv", label: "Heart rate variability", types: ["daily-heart-rate-variability"] },
  { key: "rhr", label: "Resting heart rate", types: ["daily-resting-heart-rate"] },
  { key: "resp", label: "Respiratory rate", types: ["daily-respiratory-rate"] },
  { key: "temp", label: "Skin temperature", types: ["daily-sleep-temperature-derivations"] },
  { key: "spo2", label: "Blood oxygen", types: ["daily-oxygen-saturation"] },
  { key: "exercise", label: "Exercise", types: ["exercise"] },
  { key: "vo2max", label: "VO2 max", types: ["daily-vo2-max", "run-vo2-max"] },
  { key: "calories", label: "Calories", types: ["total-calories"] },
  { key: "weight", label: "Weight and body fat", types: ["weight", "body-fat"] },
];

type SyncRow = {
  type: string;
  lastSuccessAt: number | null;
  lastError: string | null;
  backfillDaysDone: number | null;
  backfillDaysTotal: number | null;
};

function syncRows(ctx: QueryCtx) {
  return ctx.db.$client
    .prepare("select type, last_success_at lastSuccessAt, last_error lastError, backfill_days_done backfillDaysDone, backfill_days_total backfillDaysTotal from sync_state")
    .all() as SyncRow[];
}

function authState(ctx: QueryCtx): "not_connected" | "connected" | "revoked" {
  const t = ctx.db.$client.prepare("select revoked_at revokedAt from oauth_tokens where id = 1").get() as { revokedAt: number | null } | undefined;
  return !t ? "not_connected" : t.revokedAt != null ? "revoked" : "connected";
}

function importProgress(rows: SyncRow[]) {
  const pending = rows.filter((r) => r.backfillDaysTotal != null && (r.backfillDaysDone ?? 0) < r.backfillDaysTotal);
  if (!pending.length) return null;
  return { done: Math.min(...pending.map((r) => r.backfillDaysDone ?? 0)), total: Math.max(...pending.map((r) => r.backfillDaysTotal!)) };
}

/** Settings `/settings`: data source, auth, per-type sync status, backfill progress and the read-only profile. */
export function getSettings(ctx: QueryCtx = defaultCtx()): SettingsVM {
  const nowMs = ctx.now * 1000;
  const rows = syncRows(ctx);
  const statusOf = (last: number | null, error: string | null) =>
    error ? "error" : last == null ? "never" : nowMs - last * 1000 > STALE_MS ? "stale" : "ok";
  const sync: SettingsVM["sync"] =
    ctx.mode === "demo"
      ? rows
          .filter((r) => r.type === "seed")
          .map((r) => ({ key: "seed", label: "Demo generator", lastSuccessAt: r.lastSuccessAt && r.lastSuccessAt * 1000, status: statusOf(r.lastSuccessAt, r.lastError), error: r.lastError }))
      : GROUPS.map((g) => {
          const members = rows.filter((r) => g.types.includes(r.type));
          const successes = members.map((r) => r.lastSuccessAt);
          const last = members.length && successes.every((s) => s != null) ? Math.min(...(successes as number[])) : null;
          const error = members.find((r) => r.lastError)?.lastError ?? null;
          return { key: g.key, label: g.label, lastSuccessAt: last && last * 1000, status: statusOf(last, error), error };
        });
  const auth = authState(ctx);
  const p = ctx.profile;
  const today = todayOf(ctx);
  return {
    mode: ctx.mode,
    source:
      ctx.mode === "demo"
        ? { label: "Demo data", status: "demo" }
        : { label: "Google Health", status: auth },
    import: ctx.mode === "google" ? importProgress(rows) : null,
    sync,
    profile: {
      birthDate: p.birthDate,
      age: wholeYears(p.birthDate, today),
      sex: p.sex,
      maxHr: p.maxHr,
      maxHrSource: p.maxHrSet ? "set" : "estimated",
      timeZone: ctx.timeZone,
      heightCm: p.heightCm,
    },
    version: APP_VERSION,
    scoringVersion: SCORING_VERSION,
  };
}

/** More `/more`. */
export function getMore(ctx: QueryCtx = defaultCtx()): MoreVM {
  return { latestWeek: latestReport(ctx, "week"), latestMonth: latestReport(ctx, "month"), mode: ctx.mode, version: APP_VERSION, scoringVersion: SCORING_VERSION };
}

/** Today counts toward the streak once it has this many minutes of heart rate; until then the streak ends yesterday. */
const STREAK_TODAY_MIN = 6 * 60;

/**
 * Consecutive worn days (spec §4.3, I4): WHOOP's "continuous data" streak. A day is worn when it has any
 * heart rate, the same rule that keeps `band_not_worn` off its Strain. Null when the streak is 0.
 */
export function getWearStreak(ctx: QueryCtx = defaultCtx()): { days: number; asOf: string } | null {
  const today = todayOf(ctx);
  const rows = ctx.db.$client
    .prepare(
      `select day, coalesce(json_extract(strain, '$.hrCount'), 0) hr,
         coalesce(json_extract(strain, '$.hrMinutesAm'), 0) + coalesce(json_extract(strain, '$.hrMinutesPm'), 0) minutes
       from daily_scores where day <= ? order by day desc`,
    )
    .iterate(today) as Iterable<{ day: string; hr: number; minutes: number }>;
  let expected = today;
  let asOf: string | null = null;
  let days = 0;
  for (const r of rows) {
    if (r.day !== expected) break;
    expected = addDays(r.day, -1);
    // Today neither counts nor breaks the streak until it has enough data.
    if (r.day === today && r.minutes < STREAK_TODAY_MIN) continue;
    if (r.hr <= 0) break;
    asOf ??= r.day;
    days++;
  }
  return days > 0 && asOf ? { days, asOf } : null;
}

/** The AppShell's ShellStatus (top bar, sync dot, demo chip, ConnectionBanner). */
export function getShellStatus(ctx: QueryCtx = defaultCtx()): ShellStatusVM {
  const rows = syncRows(ctx).filter((r) => (ctx.mode === "demo" ? r.type === "seed" : r.type !== "seed"));
  const successes = rows.map((r) => r.lastSuccessAt).filter((s): s is number => s != null);
  const lastSuccessAt = successes.length ? Math.max(...successes) * 1000 : null;
  const stale = lastSuccessAt == null || ctx.now * 1000 - lastSuccessAt > STALE_MS;
  const error = rows.some((r) => r.lastError);
  const progress = ctx.mode === "google" ? importProgress(rows) : null;
  const auth = ctx.mode === "google" ? authState(ctx) : "connected";
  const first = firstDay(ctx);
  const connection: ShellStatusVM["connection"] =
    ctx.mode === "demo"
      ? "connected"
      : auth === "not_connected"
        ? "not_connected"
        : auth === "revoked"
          ? "auth_revoked"
          : progress
            ? "importing"
            : stale
              ? "stale"
              : "connected";
  return {
    mode: ctx.mode,
    sync: { state: error ? "error" : stale ? "stale" : "ok", lastSuccessAt },
    connection,
    ...(progress && { importProgress: progress }),
    today: todayOf(ctx),
    ...(first && { firstDay: first }),
    timeZone: ctx.timeZone,
    streak: getWearStreak(ctx),
  };
}
