// Ports HrZones.kt: the five %HRmax display zones and time-in-zone. Independent of Strain's Edwards %HRR
// zones. Not ported: the single-entry zone-set cache.
import type { HrSample } from "./types";

export interface HrZone {
  /** 1..5 */
  number: number;
  /** Inclusive, bpm. */
  lower: number;
  /** Exclusive except for zone 5. */
  upper: number;
  lowerPct: number;
  upperPct: number;
}

export interface HrZoneSet {
  zones: HrZone[];
  maxHR: number;
  source: "tanaka" | "manual" | "custom";
}

export interface TimeInZone {
  /** Seconds in zones 1..5 (seconds[0] is zone 1). */
  seconds: number[];
  belowZone1: number;
}

export const zoneEdges = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
/** Editable BPM range for personalized zone starts. */
export const customBPMRange = { min: 30, max: 250 };

export const tanakaMaxHR = (age: number): number => 208.0 - 0.7 * age;

/** Zones from age (Tanaka) or a manual HRmax override. */
export function zonesForAge(age: number, maxHROverride: number | null = null, customLowerBounds: number[] | null = null): HrZoneSet {
  return maxHROverride != null
    ? zones(maxHROverride, "manual", customLowerBounds)
    : zones(tanakaMaxHR(age), "tanaka", customLowerBounds);
}

/** Zones from a known HRmax, optionally from five personalized lower bounds (invalid ones fall back). */
export function zones(
  maxHR: number,
  source: "tanaka" | "manual" = "manual",
  customLowerBounds: number[] | null = null,
): HrZoneSet {
  const custom = customLowerBounds ? validCustomLowerBounds(customLowerBounds) : null;
  const built: HrZone[] = [];
  for (let i = 0; i < 5; i++) {
    const lower = custom ? custom[i] : zoneEdges[i] * maxHR;
    const upper = custom ? (i < 4 ? custom[i + 1] : Math.max(maxHR, custom[i])) : zoneEdges[i + 1] * maxHR;
    built.push({
      number: i + 1,
      lower,
      upper,
      lowerPct: maxHR > 0 ? lower / maxHR : 0.0,
      upperPct: maxHR > 0 ? upper / maxHR : 0.0,
    });
  }
  return { zones: built, maxHR, source: custom ? "custom" : source };
}

/** Zone 1..5 for a bpm, or 0 below zone 1. */
export function zoneNumber(set: HrZoneSet, bpm: number): number {
  for (const z of set.zones) {
    if (z.number === 5) {
      if (bpm >= z.lower) return 5;
    } else if (bpm >= z.lower && bpm < z.upper) {
      return z.number;
    }
  }
  return 0;
}

/** Conventional lower bounds rounded up to whole BPM, for an editor. */
export const defaultLowerBounds = (maxHR: number): number[] => zoneEdges.slice(0, 5).map((e) => Math.ceil(e * maxHR));

/** The bounds if positive, finite and strictly increasing; otherwise null. */
export function validCustomLowerBounds(values: number[]): number[] | null {
  if (values.length !== 5 || !values.every((v) => Number.isFinite(v) && v > 0)) return null;
  for (let i = 1; i < values.length; i++) if (values[i] <= values[i - 1]) return null;
  return values;
}

/**
 * Seconds per zone. Each sample holds until the next, capped at the median interval; the last sample gets
 * the median interval.
 */
export function timeInZone(hr: HrSample[], zoneSet: HrZoneSet): TimeInZone {
  const sorted = [...hr].sort((a, b) => a.ts - b.ts);
  const seconds = [0, 0, 0, 0, 0];
  let below = 0.0;
  if (sorted.length === 0) return { seconds, belowZone1: 0.0 };
  const tail = medianInterval(sorted);
  for (let i = 0; i < sorted.length; i++) {
    let dur = tail;
    if (i < sorted.length - 1) {
      const gap = sorted[i + 1].ts - sorted[i].ts;
      dur = gap > 0 ? Math.min(gap, tail) : tail;
    }
    const z = zoneNumber(zoneSet, sorted[i].bpm);
    if (z >= 1) seconds[z - 1] += dur;
    else below += dur;
  }
  return { seconds, belowZone1: below };
}

/** Median gap among plausible (0, 300 s) gaps; 1 s when there are none. */
export function medianInterval(sorted: HrSample[]): number {
  if (sorted.length < 2) return 1.0;
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const g = sorted[i].ts - sorted[i - 1].ts;
    if (g > 0 && g < 300) gaps.push(g);
  }
  if (gaps.length === 0) return 1.0;
  gaps.sort((a, b) => a - b);
  return Math.max(gaps[Math.floor(gaps.length / 2)], 1.0);
}

export const totalSeconds = (t: TimeInZone): number => t.seconds.reduce((a, b) => a + b, 0) + t.belowZone1;

export const secondsInZone = (t: TimeInZone, zone: number): number => (zone < 1 || zone > 5 ? 0.0 : t.seconds[zone - 1]);
