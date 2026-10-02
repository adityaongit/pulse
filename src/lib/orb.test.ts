import { describe, expect, it } from "vitest";
import { blobRadius, noise2, ORB, orbColors, particleCount, rng } from "./orb";

const first = ORB.stops[0];
const last = ORB.stops[ORB.stops.length - 1];
const teal = ORB.stops.find((s) => s.at === 0)!;

describe("orbColors", () => {
  it("is green at and below the younger end", () => {
    expect(orbColors(first.at)).toEqual({ top: first.top, bottom: first.bottom });
    expect(orbColors(-12)).toEqual(orbColors(first.at));
  });
  it("is amber at and above the older end", () => {
    expect(orbColors(last.at)).toEqual({ top: last.top, bottom: last.bottom });
    expect(orbColors(9.4)).toEqual(orbColors(last.at));
  });
  it("is teal at zero", () => {
    expect(orbColors(0)).toEqual({ top: teal.top, bottom: teal.bottom });
  });
  it("splits blue over warm in between (mixed references)", () => {
    const { top, bottom } = orbColors(1.8);
    expect(top[2]).toBeGreaterThan(top[0]); // blue on top
    expect(bottom[0]).toBeGreaterThan(bottom[2]); // orange underneath
  });
  it("is continuous across a stop", () => {
    const a = orbColors(0.8 - 1e-6).bottom;
    const b = orbColors(0.8 + 1e-6).bottom;
    a.forEach((v, i) => expect(Math.abs(v - b[i])).toBeLessThan(0.01));
  });
  it("is grey with no result", () => {
    expect(orbColors(null)).toEqual({ top: ORB.empty, bottom: ORB.empty });
    expect(orbColors(Number.NaN)).toEqual(orbColors(null));
  });
});

describe("shape noise", () => {
  it("is deterministic and bounded", () => {
    for (let i = 0; i < 200; i++) {
      const x = i * 0.37 - 20;
      const y = i * 0.11 + 3;
      expect(noise2(x, y)).toBe(noise2(x, y));
      expect(Math.abs(noise2(x, y))).toBeLessThanOrEqual(1);
    }
    expect(blobRadius(1.3, 4.2, 7)).toBe(blobRadius(1.3, 4.2, 7));
  });
  it("closes the edge and stays near a circle", () => {
    expect(blobRadius(0, 2, 5)).toBeCloseTo(blobRadius(Math.PI * 2, 2, 5), 10);
    const max = 1 + ORB.shape.lowAmp + ORB.shape.smallHighAmp;
    for (let a = 0; a < Math.PI * 2; a += 0.1) {
      const r = blobRadius(a, 3, 9, true);
      expect(r).toBeGreaterThanOrEqual(2 - max);
      expect(r).toBeLessThanOrEqual(max);
    }
  });
  it("seeded rng repeats", () => {
    const a = rng(42);
    const b = rng(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
  it("scales particle count with size within the cap", () => {
    expect(particleCount(300)).toBeGreaterThanOrEqual(1500);
    expect(particleCount(300)).toBeLessThanOrEqual(3000);
    expect(particleCount(2000)).toBe(ORB.particles.max);
    expect(particleCount(40)).toBe(ORB.particles.min);
  });
});
