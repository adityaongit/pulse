// Fetches the last 7 days of every catalogue type into raw_payloads and prints shapes, never values:
// field paths and JSON types, point counts, cadence, and the answers docs/data-notes.md asks for.
//
// Needs GOOGLE_OAUTH_ENABLED=true and a completed consent (/oauth/start). Stop the server first, or
// the two processes share the 5 QPS per-user limit. From the repo root:
//   pnpm tsx --env-file=.env src/server/sources/google/probe.ts
import { getConfig } from "../../config";
import { getDb } from "../../db";
import { DATA_TYPE_IDS, DATA_TYPES, type DataTypeId } from "./catalogue";
import { addDays, localDay, localMidnight } from "../../time";
import { createGoogleClient, type GoogleClient } from "./client";
import { GoogleError } from "./oauth";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** Sorted `path  type` lines across all points. Arrays become `[]`. Values are never included. */
export function fieldPaths(points: unknown[]): string[] {
  const out = new Set<string>();
  const walk = (v: unknown, path: string) => {
    if (Array.isArray(v)) {
      out.add(`${path}  array`);
      v.forEach((x) => walk(x, `${path}[]`));
    } else if (isObj(v)) for (const [k, x] of Object.entries(v)) walk(x, path ? `${path}.${k}` : k);
    else out.add(`${path}  ${typeof v}`);
  };
  points.forEach((p) => walk(p, ""));
  return [...out].sort();
}

/** The point's own object, e.g. `point.heartRate` (the key that is not dataSource or name). */
const payload = (p: unknown): Obj | undefined =>
  isObj(p) ? (Object.entries(p).find(([k, v]) => k !== "dataSource" && k !== "name" && isObj(v))?.[1] as Obj) : undefined;

/** Median seconds between consecutive points, by sampleTime.physicalTime or interval.startTime. */
export function medianGapSeconds(points: unknown[]): number | null {
  const ts = points
    .map((p) => {
      const o = payload(p) as { sampleTime?: { physicalTime?: string }; interval?: { startTime?: string } } | undefined;
      return Date.parse(o?.sampleTime?.physicalTime ?? o?.interval?.startTime ?? "");
    })
    .filter((t) => !Number.isNaN(t))
    .sort((a, b) => a - b);
  const gaps = ts.slice(1).map((t, i) => (t - ts[i]) / 1000).sort((a, b) => a - b);
  return gaps.length ? gaps[Math.floor(gaps.length / 2)] : null;
}

const civil = (d: unknown) => (isObj(d) ? `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}` : "?");
const devices = (points: unknown[]) =>
  [...new Set(points.map((p) => {
    const s = (p as { dataSource?: { platform?: string; device?: { displayName?: string } } }).dataSource;
    return `${s?.platform ?? "?"}/${s?.device?.displayName ?? "-"}`;
  }))].join(", ");

async function fetchType(client: GoogleClient, id: DataTypeId, from: string, to: string, tz: string) {
  return DATA_TYPES[id].member
    ? client.list(id, localMidnight(from, tz), localMidnight(to, tz))
    : client.dailyRollUp(id, from, to);
}

async function main() {
  const cfg = getConfig();
  if (!cfg.google) throw new Error("set GOOGLE_OAUTH_ENABLED=true");
  const tz = cfg.timeZone;
  const client = createGoogleClient({ db: getDb(), google: cfg.google, timeZone: tz });
  const to = addDays(localDay(Date.now() / 1000, tz), 1);
  const from = addDays(to, -7);
  const got: Partial<Record<DataTypeId, unknown[]>> = {};
  const fail = (err: unknown) => (err instanceof GoogleError ? err.message : "failed");

  console.log(`# Probe ${from} .. ${to} (exclusive), TZ ${tz}\n`);
  for (const id of DATA_TYPE_IDS) {
    try {
      const points = (got[id] = await fetchType(client, id, from, to, tz));
      console.log(`## ${id}\npoints: ${points.length} (${(points.length / 7).toFixed(0)}/day), median gap: ${medianGapSeconds(points) ?? "-"} s`);
      console.log(`sources: ${devices(points)}\n${fieldPaths(points).join("\n")}\n`);
    } catch (err) {
      console.log(`## ${id}\n${fail(err)}\n`);
    }
  }
  try {
    console.log(`## steps dailyRollUp\n${fieldPaths(await client.dailyRollUp("steps", from, to)).join("\n")}\n`);
  } catch (err) {
    console.log(`## steps dailyRollUp\n${fail(err)}\n`);
  }

  console.log("# Q1: civil date of each night's daily metrics vs the main sleep's wake day");
  for (const id of DATA_TYPE_IDS.filter((t) => t.startsWith("daily-"))) {
    console.log(`${id}: ${(got[id] ?? []).map((p) => civil(payload(p)?.date)).sort().join(", ")}`);
  }
  const mains = (got.sleep ?? []).map(payload).filter((s) => (s?.metadata as Obj | undefined)?.mainSleep);
  const at = (s: Obj | undefined, k: string) => localDay(Date.parse(String((s?.interval as Obj | undefined)?.[k])) / 1000, tz);
  console.log(`sleep (main) start -> wake day: ${mains.map((s) => `${at(s, "startTime")} -> ${at(s, "endTime")}`).join(", ")}\n`);

  console.log("# Q2: VO2max types populated");
  for (const id of ["vo2-max", "daily-vo2-max", "run-vo2-max"] as const) console.log(`${id}: ${got[id]?.length ?? "failed"}`);

  console.log("\n# Q3: history from an older device (daily-resting-heart-rate, 7 days at each depth)");
  for (const years of [1, 2, 3, 5]) {
    const end = addDays(to, -365 * years);
    try {
      const points = await fetchType(client, "daily-resting-heart-rate", addDays(end, -7), end, tz);
      console.log(`${years}y back: ${points.length} points, sources: ${devices(points) || "-"}`);
    } catch (err) {
      console.log(`${years}y back: ${fail(err)}`);
    }
  }
}

if (process.argv[1]?.endsWith("probe.ts")) {
  main().catch((err) => {
    console.error(err instanceof GoogleError ? err.message : err);
    process.exit(1);
  });
}
