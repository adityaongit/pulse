// Scroll-linked collapse (spec §4.3, docs/design/sticky.md): progress along a collapse distance, and
// where a progress value lands on the page's scroll timeline (0-1 of the whole scroll range).

export const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n)

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/** 0 until `scroll` reaches `start`, 1 from `end`, linear between. */
export function collapseProgress(scroll: number, start: number, end: number) {
  if (end <= start) return scroll >= end ? 1 : 0
  return clamp01((scroll - start) / (end - start))
}

/** The scroll-timeline offset (share of `maxScroll`) at which collapse progress `p` happens. */
export function timelineOffset(p: number, start: number, end: number, maxScroll: number) {
  if (maxScroll <= 0) return 1
  return clamp01((start + clamp01(p) * (end - start)) / maxScroll)
}

/** Marks the hero wrapper in DetailShell's body, the element a CollapsingHeader watches. */
export const COLLAPSE_HERO = "data-collapse-hero"
