// Pure parts of the WHOOP Age orb (docs/design/orb.md): colour mapping, shape noise, seeded RNG.
// Kept free of DOM so they can be unit tested; the canvas code lives in WhoopAgeOrb.tsx.
import { lerp } from "./collapse";

export type RGB = readonly [number, number, number];

/** A colour stop: `at` is WHOOP Age minus chronological age, in years. Rim colour at the top and bottom of the orb. */
type Stop = { at: number; top: RGB; bottom: RGB };

/**
 * Every tunable in one place. Hues are the brightest rim pixels sampled with PIL from
 * docs/design/reference/latest-whoop-age-*.jpg (see orb.md for which file gave which).
 */
export const ORB = {
  stops: [
    { at: -3, top: [0x4c, 0xd4, 0x8c], bottom: [0x4c, 0xd4, 0x8c] }, // green-1/2: 6.6 and 10.5 younger
    { at: -1, top: [0x7c, 0xc4, 0xd4], bottom: [0x7c, 0xc4, 0xd4] }, // cyan-1: 1.0 younger
    { at: 0, top: [0x7c, 0xc4, 0xd4], bottom: [0x7c, 0xc4, 0xd4] }, // neutral holds the same teal
    { at: 0.8, top: [0x58, 0x88, 0xc0], bottom: [0x6a, 0x84, 0x52] }, // mixed-1: 0.8 older, blue over olive
    { at: 1.8, top: [0x5e, 0x8c, 0xc0], bottom: [0xd4, 0x84, 0x3a] }, // mixed-2: 1.8 older, blue over orange
    { at: 3, top: [0xc8, 0x86, 0x2e], bottom: [0xc8, 0x86, 0x2e] }, // amber-1: 5.6 older
  ] satisfies Stop[],
  /** No result: a dim grey orb. */
  empty: [0x5c, 0x62, 0x68] as RGB,
  /** Delta line inside the orb: pale cyan (#7EC6E4 in amber-1, cyan-1, mixed-1), mint (`text-optimal`, #1EDE9C in green-2) once the orb is green. */
  deltaText: "#7ec6e4",
  greenText: -2,
  /** Rim fill = edge colour × this; particles and the edge line are brighter tints. */
  fillShade: 0.68,
  shape: {
    /** Radius of the blob relative to half the box, leaving room for the bulges. */
    radius: 0.9,
    lowFreq: 0.85,
    lowAmp: 0.075,
    highFreq: 2.1,
    highAmp: 0.028,
    /** Small orbs (Health hub, < 160 px) are visibly more lobed in the references. */
    smallHighAmp: 0.05,
    /** How fast the noise field drifts, units per second. Slow. */
    drift: 0.05,
  },
  particles: {
    /** Particles at 320 px; scaled by area and clamped. */
    at320: 3000,
    min: 280,
    max: 3000,
    /** Share of tiny dust, crisp dots, soft bokeh discs. */
    mix: [0.68, 0.27, 0.05] as const,
  },
  entry: { duration: 1.2, maxDelay: 0.35 },
  /** Idle drift stops after this long without interaction (WCAG 2.2.2); touch or re-entering view resumes it. */
  idleSeconds: 30,
  /** Touch: particles gather toward the centre and swirl (latest-whoop-age-touch-frames.jpg). */
  touch: { ease: 5, swirl: 1.1, wobble: 0.6, bulge: 0.06 },
  /** Canvas pixel ratio cap. */
  maxDpr: 2,
} as const;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const mixRGB = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
export const shadeRGB = (c: RGB, k: number): RGB => [Math.min(255, c[0] * k), Math.min(255, c[1] * k), Math.min(255, c[2] * k)];
export const css = (c: RGB, a = 1) => `rgb(${Math.round(c[0])} ${Math.round(c[1])} ${Math.round(c[2])} / ${a})`;

/** Rim colours for a WHOOP Age delta (years older is positive). `null` gives the grey empty orb. */
export function orbColors(delta: number | null): { top: RGB; bottom: RGB } {
  if (delta === null || !Number.isFinite(delta)) return { top: ORB.empty, bottom: ORB.empty };
  const s = ORB.stops;
  const d = clamp(delta, s[0].at, s[s.length - 1].at);
  const i = Math.max(0, s.findIndex((x) => x.at >= d) - 1);
  const a = s[i];
  const b = s[Math.min(i + 1, s.length - 1)];
  const t = b.at === a.at ? 0 : (d - a.at) / (b.at - a.at);
  return { top: mixRGB(a.top, b.top, t), bottom: mixRGB(a.bottom, b.bottom, t) };
}

/** Integer hash to [0, 1). */
function hash2(x: number, y: number) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** 2D value noise in [-1, 1], smooth and deterministic. */
export function noise2(x: number, y: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const top = lerp(hash2(xi, yi), hash2(xi + 1, yi), u);
  const bot = lerp(hash2(xi, yi + 1), hash2(xi + 1, yi + 1), u);
  return lerp(top, bot, v) * 2 - 1;
}

/**
 * Blob radius multiplier at angle `theta` and time `t` (seconds). Sampling the noise on a circle keeps the edge
 * closed; drifting the sample centre over time morphs it. `wobble` scales the bumps (1 at rest, more on touch).
 */
export function blobRadius(theta: number, t: number, seed: number, small = false, wobble = 1) {
  const s = ORB.shape;
  const c = Math.cos(theta);
  const n = Math.sin(theta);
  const o = t * s.drift;
  const low = noise2(seed + c * s.lowFreq + o, seed * 0.37 + n * s.lowFreq + o * 0.6);
  const high = noise2(seed * 1.9 + c * s.highFreq - o * 1.3, 11 + n * s.highFreq + o);
  return 1 + wobble * (s.lowAmp * low + (small ? s.smallHighAmp : s.highAmp) * high);
}

/** How many particles an orb of `size` CSS px gets. */
export const particleCount = (size: number) =>
  Math.round(clamp(ORB.particles.at320 * (size / 320) ** 2, ORB.particles.min, ORB.particles.max));

/** Seeded RNG (mulberry32) so the same orb draws the same particles on every render. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const easeOutCubic = (t: number) => 1 - (1 - clamp(t, 0, 1)) ** 3;
