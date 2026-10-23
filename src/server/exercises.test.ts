import { describe, expect, it } from "vitest";
import { sameExercise, uniqueExercises } from "./exercises";

const walk = { id: "a", day: "2026-10-01", type: "WALKING", startTs: 1000, endTs: 2800, distanceM: 1900 };
const copy = { ...walk, id: "b", startTs: 1002, endTs: 2805, distanceM: 1901 };

describe("duplicate exercises", () => {
  it("keeps a stable original despite source ordering and small timing/distance differences", () => {
    expect(uniqueExercises([copy, walk])).toEqual([walk]);
    expect(uniqueExercises([walk, copy])).toEqual([walk]);
  });

  it.each([
    { ...copy, type: "RUNNING" },
    { ...copy, day: "2026-10-02" },
    { ...copy, startTs: 1040 },
    { ...copy, endTs: 2840 },
    { ...copy, distanceM: 2100 },
    { ...copy, distanceM: null },
    { ...copy, distanceM: 0 },
    { ...copy, endTs: 1200 },
    { ...copy, startTs: 2800, endTs: 4600 },
  ])("preserves distinct or uncertain records: %j", (other) => {
    expect(uniqueExercises([walk, other])).toHaveLength(2);
  });

  it("keeps short activities even when their endpoints and distances agree", () => {
    expect(uniqueExercises([{ ...walk, endTs: 1200 }, { ...copy, endTs: 1202 }])).toHaveLength(2);
  });

  it("does not merge a chain whose endpoints exceed the tolerance", () => {
    const middle = { ...copy, startTs: 1025, endTs: 2825 };
    const last = { ...copy, id: "c", startTs: 1050, endTs: 2850 };
    expect(uniqueExercises([last, middle, walk])).toEqual([walk, last]);
    expect(sameExercise(walk, walk)).toBe(true);
  });
});
