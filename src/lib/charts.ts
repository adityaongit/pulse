// Plain data helpers for the Recharts components. No SVG maths: these only shape series and slices
// that Recharts primitives draw (spec §5.0, §5.1, §5.6).

export type XY = { x: number; y: number | null };
export type BandRow = { x: number } & Record<string, number | null>;

/**
 * One series per band, keyed `b0`, `b1`… A value is in band i when it is ≥ thresholds[i-1] and
 * < thresholds[i] (so Energy uses [34, 67] for red ≤ 33, yellow 34-66, green ≥ 67; Stress uses [1, 2]).
 * Each point is also copied into the next point's band so the coloured segments join. Nulls stay gaps.
 */
export function splitByBand(points: XY[], thresholds: number[]) {
  const keys = Array.from({ length: thresholds.length + 1 }, (_, i) => `b${i}`);
  const band = (y: number) => thresholds.filter((t) => y >= t).length;
  const rows: BandRow[] = points.map((p) => {
    const row: BandRow = { x: p.x };
    for (const k of keys) row[k] = null;
    if (p.y !== null) row[`b${band(p.y)}`] = p.y;
    return row;
  });
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i].y;
    const b = points[i + 1].y;
    if (a !== null && b !== null && band(a) !== band(b)) rows[i][`b${band(b)}`] = a;
  }
  return { rows, keys };
}

// --- Hypnogram ---

export type Stage = "awake" | "rem" | "light" | "deep";
export const STAGES: Stage[] = ["awake", "rem", "light", "deep"];
export const STAGE_LANE: Record<Stage, number> = { awake: 3, rem: 2, light: 1, deep: 0 };
export type StageSegment = { stage: Stage; start: number; end: number };
type LanePoint = { t: number; lane: number | null };

/**
 * The connector runs through every segment start (stepAfter) and ends at the last wake. Each stage
 * gets its own series holding its lane only inside its segments, with a null after each one so
 * two separate REM blocks never join across the night.
 */
export function hypnogramSeries(segments: StageSegment[]) {
  const sorted = [...segments].sort((a, b) => a.start - b.start);
  const connector: LanePoint[] = sorted.map((s) => ({ t: s.start, lane: STAGE_LANE[s.stage] }));
  const last = sorted.at(-1);
  if (last) connector.push({ t: last.end, lane: STAGE_LANE[last.stage] });
  const stages = Object.fromEntries(STAGES.map((s) => [s, [] as LanePoint[]])) as Record<Stage, LanePoint[]>;
  for (const s of sorted) {
    const lane = STAGE_LANE[s.stage];
    stages[s.stage].push({ t: s.start, lane }, { t: s.end, lane }, { t: s.end, lane: null });
  }
  return { connector, stages };
}

// --- Time axes ---

const MINUTE = 60_000;
function localMinuteOfDay(ms: number, timeZone?: string) {
  const parts = new Intl.DateTimeFormat("en-GB", { hour: "numeric", minute: "numeric", hourCycle: "h23", timeZone }).formatToParts(ms);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return get("hour") * 60 + get("minute");
}

/** Ticks on whole local clock times that are multiples of `stepMinutes` (60 = whole hours), inside [start, end]. */
export function clockTicks(start: number, end: number, stepMinutes = 60, timeZone?: string) {
  const firstMinute = Math.ceil(start / MINUTE) * MINUTE;
  const into = localMinuteOfDay(firstMinute, timeZone) % stepMinutes;
  const ticks: number[] = [];
  for (let t = firstMinute + (into ? stepMinutes - into : 0) * MINUTE; t <= end; t += stepMinutes * MINUTE) ticks.push(t);
  return ticks;
}

/** Whole local hours that are multiples of `stepHours`. */
export const hourTicks = (start: number, end: number, stepHours = 1, timeZone?: string) => clockTicks(start, end, stepHours * 60, timeZone);

/** Y domain rounded out to 10s with 10 of headroom: [min - 10, max + 10]. */
export function paddedDomain(values: (number | null)[]): [number, number] {
  const v = values.filter((x): x is number => x !== null);
  if (!v.length) return [40, 180];
  return [Math.floor((Math.min(...v) - 10) / 10) * 10, Math.ceil((Math.max(...v) + 10) / 10) * 10];
}

// --- ScoreDial slices (Pie data, not angles) ---

/** Strain Target band on the 0-21 track: [before, band, after]. */
export function targetSlices(lo: number, hi: number, max = 21) {
  const a = Math.min(Math.max(lo, 0), max);
  const b = Math.min(Math.max(hi, a), max);
  return [a, b - a, max - b];
}

/** A thin marker slice centred on `value`: [before, width, after], clamped to the domain. */
export function markerSlices(value: number, max: number, width: number) {
  const mid = Math.min(Math.max(value, width / 2), max - width / 2);
  return [mid - width / 2, width, max - mid - width / 2];
}

/**
 * Ring radii as percentages of the dial radius, so the 768 px size step needs no JS. `inset` px
 * are reserved outside the ring for the strain tick, which overhangs the ring by 2 px.
 */
export function ringRadii(diameter: number, ring: number, inset = 2) {
  const r = diameter / 2;
  const pct = (px: number) => `${Math.round((px / r) * 1000) / 10}%`;
  return {
    outer: pct(r - inset),
    inner: pct(r - inset - ring),
    tickOuter: "100%",
    tickInner: pct(r - inset - ring - 2),
  };
}
