// Google Health API v4 client: local-day windows, pagination, a 4 req/s limiter, retries, and the
// raw archive. Pattern from Hælan's api/client.ts, store/rawArchive.ts and sync/windows.ts (AGPL-3.0).
//
// Times are unix seconds and days are local `YYYY-MM-DD`, as in the schema. Errors carry status and
// code only (see oauth.ts), never a token or a body.
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import type { Db } from "../../db";
import { rawPayloads } from "../../db/schema";
import { addDays, localDay, localMidnight, wall } from "../../time";
import { DATA_TYPES, type DataType, type DataTypeId, type FilterMember } from "./catalogue";
import { errorCode, FETCH_TIMEOUT_MS, getAccessToken, GoogleError, markRevoked, parseJson } from "./oauth";

const API = "https://health.googleapis.com/v4/users/me/dataTypes";
const MIN_GAP_MS = 250; // 4 req/s, under the documented 5 QPS per user
const MAX_TRIES = 5; // per request, for 429, 5xx and network failures
const BACKOFF_MS = 1000;
const MAX_WAIT_MS = 5 * 60_000;
const MAX_PAGES = 1000; // a nextPageToken that never advances must not loop forever

// --- Local days ---------------------------------------------------------------------------------

/** The first local midnight at or after `s`. */
function ceilMidnight(s: number, tz: string): number {
  const m = localMidnight(localDay(s, tz), tz);
  return m >= s ? m : localMidnight(addDays(localDay(s, tz), 1), tz);
}

export type TimeWindow = { start: number; end: number };

/** Splits [from, to) at local midnights into windows of at most `maxDays` local days, with no gap or overlap. */
export function localWindows(from: number, to: number, maxDays: number, tz: string): TimeWindow[] {
  const out: TimeWindow[] = [];
  let day = localDay(from, tz);
  for (let start = from; start < to; ) {
    day = addDays(day, maxDays);
    const end = Math.min(to, localMidnight(day, tz));
    if (end <= start) continue; // only in a zone whose midnight falls in a DST gap
    out.push({ start, end });
    start = end;
  }
  return out;
}

const civilDate = (day: string) => {
  const [year, month, d] = day.split("-").map(Number);
  return { date: { year, month, day: d } };
};

/** `<snake_type>.<member> >= X AND < Y`. Civil members are written in `tz`; `date` rounds the end up to a whole day. */
export function buildFilter(type: DataTypeId, member: FilterMember, w: TimeWindow, tz: string): string {
  const field = `${type.replaceAll("-", "_")}.${member}`;
  const [lo, hi] =
    member === "date"
      ? [localDay(w.start, tz), localDay(ceilMidnight(w.end, tz), tz)]
      : member === "interval.civil_start_time"
        ? [w.start, w.end].map((s) => {
            const { day, time } = wall(s, tz);
            return `${day}T${time}`;
          })
        : [w.start, w.end].map((s) => new Date(s * 1000).toISOString());
  return `${field} >= "${lo}" AND ${field} < "${hi}"`;
}

// --- Raw archive --------------------------------------------------------------------------------

/**
 * Stores a page gzipped, keyed by (type, range, sha256 of the body). Re-storing an unchanged page is a no-op.
 * Returns true when a row was inserted.
 */
export function archivePage(
  db: Db,
  p: { type: string; rangeStart: number; rangeEnd: number; body: string; fetchedAt: number },
): boolean {
  const bodyHash = createHash("sha256").update(p.body).digest("hex");
  return (
    db
      .insert(rawPayloads)
      .values({
        type: p.type,
        rangeStart: p.rangeStart,
        rangeEnd: p.rangeEnd,
        bodyHash,
        gzBody: gzipSync(p.body),
        fetchedAt: p.fetchedAt,
      })
      .onConflictDoNothing()
      .run().changes > 0
  );
}

// --- Client -------------------------------------------------------------------------------------

export type ClientDeps = {
  db: Db;
  google: { clientId: string; clientSecret: string };
  timeZone: string;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** Milliseconds. */
  now?: () => number;
};

/** Create one per sync run: the 4 req/s limiter lives in the instance. */
export function createGoogleClient({
  db,
  google,
  timeZone: tz,
  fetch: fetchFn = fetch,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  now = Date.now,
}: ClientDeps) {
  let nextSlot = 0;
  async function throttle() {
    const t = now();
    const wait = Math.max(0, nextSlot - t);
    nextSlot = Math.max(t, nextSlot) + MIN_GAP_MS;
    if (wait) await sleep(wait);
  }

  function retryAfterMs(header: string | null): number | undefined {
    if (!header) return undefined;
    const ms = /^\d+$/.test(header.trim()) ? Number(header) * 1000 : Date.parse(header) - now();
    return Number.isNaN(ms) ? undefined : ms;
  }

  /** The 200 body. One forced refresh on 401, then `auth_revoked`; 429 waits Retry-After; 5xx backs off. */
  async function request(url: string, where: string, body?: string): Promise<string> {
    let tries = 0; // failed attempts that may be retried: 429, 5xx, network
    let refreshed = false;
    let force = false; // set for the one attempt right after a 401
    for (;;) {
      const token = await getAccessToken(db, google, { fetch: fetchFn, now, force });
      force = false;
      await throttle();
      let res: Response;
      try {
        res = await fetchFn(url, {
          method: body ? "POST" : "GET",
          headers: { authorization: `Bearer ${token}`, ...(body && { "content-type": "application/json" }) },
          body,
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        // Inside the try: a body cut off mid-read is a network failure too.
        if (res.ok) return await res.text();
      } catch {
        if (++tries >= MAX_TRIES) throw new GoogleError("network", undefined, where);
        await sleep(BACKOFF_MS * 2 ** (tries - 1));
        continue;
      }
      const { status } = res;
      if (status === 401) {
        await res.body?.cancel();
        if (refreshed) {
          markRevoked(db, now());
          throw new GoogleError("auth_revoked", status, where);
        }
        refreshed = force = true;
        continue;
      }
      if ((status === 429 || status >= 500) && ++tries < MAX_TRIES) {
        const after = status === 429 ? retryAfterMs(res.headers.get("retry-after")) : undefined;
        await res.body?.cancel();
        await sleep(Math.min(MAX_WAIT_MS, Math.max(0, after ?? BACKOFF_MS * 2 ** (tries - 1))));
        continue;
      }
      throw new GoogleError(errorCode(parseJson(await res.text())) ?? `http_${status}`, status, where);
    }
  }

  /** Parses a 200 body; one that is not the expected envelope is an error, never "no data". */
  function readPage(body: string, key: string, where: string): { points: unknown[]; next?: string } {
    const j = parseJson(body);
    if (typeof j !== "object" || j === null) throw new GoogleError("bad_response", 200, where);
    const { [key]: pts = [], nextPageToken: next } = j as Record<string, unknown>;
    if (!Array.isArray(pts)) throw new GoogleError("bad_response", 200, where);
    return { points: pts, next: typeof next === "string" && next ? next : undefined };
  }

  const fetchedAt = () => Math.floor(now() / 1000);

  return {
    /**
     * Every data point of `type` in [from, to), split into local-day windows of at most the type's
     * `maxDays`, every page archived. Points come back in API order. Memory holds the whole range, so
     * a caller walking dense types (heart-rate) passes a day or so at a time.
     */
    async list(type: DataTypeId, from: number, to: number): Promise<unknown[]> {
      const t: DataType = DATA_TYPES[type];
      if (!t.member) throw new GoogleError("unsupported_action", undefined, `${type} list`);
      const out: unknown[] = [];
      for (const w of localWindows(from, to, t.maxDays, tz)) {
        const filter = buildFilter(type, t.member, w, tz);
        // The archive range is the window's whole local days, so a re-fetch of a partial day keeps
        // the same key and an unchanged body dedupes. Exact times are inside the body.
        const range = { rangeStart: localMidnight(localDay(w.start, tz), tz), rangeEnd: ceilMidnight(w.end, tz) };
        let pageToken: string | undefined;
        let pages = 0;
        do {
          if (++pages > MAX_PAGES) throw new GoogleError("too_many_pages", undefined, type);
          const q = new URLSearchParams({ filter, pageSize: String(t.pageSize), ...(pageToken && { pageToken }) });
          const body = await request(`${API}/${type}/dataPoints?${q}`, type);
          archivePage(db, { type, ...range, body, fetchedAt: fetchedAt() }); // before parsing: a changed shape is kept as evidence
          const page = readPage(body, "dataPoints", type);
          out.push(...page.points);
          pageToken = page.next;
        } while (pageToken);
      }
      return out;
    },

    /**
     * `rollupDataPoints` for civil days [fromDay, toDay) (exclusive end), in ranges of at most the
     * type's `maxDays`. One POST per range: rollups do not paginate. Days with no data are omitted.
     */
    async dailyRollUp(type: DataTypeId, fromDay: string, toDay: string): Promise<unknown[]> {
      const t: DataType = DATA_TYPES[type];
      if (!t.dailyRollUp) throw new GoogleError("unsupported_action", undefined, `${type} dailyRollUp`);
      const out: unknown[] = [];
      for (let day = fromDay; day < toDay; ) {
        const end = addDays(day, t.maxDays) < toDay ? addDays(day, t.maxDays) : toDay;
        const req = JSON.stringify({ range: { start: civilDate(day), end: civilDate(end) } });
        const body = await request(`${API}/${type}/dataPoints:dailyRollUp`, `${type} dailyRollUp`, req);
        archivePage(db, {
          type,
          rangeStart: localMidnight(day, tz),
          rangeEnd: localMidnight(end, tz),
          body,
          fetchedAt: fetchedAt(),
        });
        out.push(...readPage(body, "rollupDataPoints", `${type} dailyRollUp`).points);
        day = end;
      }
      return out;
    },
  };
}

export type GoogleClient = ReturnType<typeof createGoogleClient>;
