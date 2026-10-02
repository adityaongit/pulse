// Home's collapsing header (spec §4.3): which rows show for a scroll position.
// WHOOP keeps the top row (avatar, streak, date pill, sync) AND adds the Sleep / Recovery / Strain
// ring row once the dials scroll away; the top row never hides (user correction, 2026-10-03).
// The dials shrink into the ring row with scroll (src/lib/collapse.ts); this is the discrete state
// behind it, which decides focus, aria and which links take pointer input.

export type HeaderState = "top" | "rings";

/** Marks the bottom of Home's dial labels: the end of the collapse distance. */
export const HEADER_SENTINEL = "data-header-sentinel";

/** Marks Home's dial row: the start of the collapse distance and the elements that morph. */
export const HOME_DIALS = "data-home-dials";

/**
 * Classes for the dial row. While the morph runs (`data-morph`, set by HomeHeader) the row paints over
 * the header band, and only the moving ring and label take taps, so the links' unmoved boxes never cover
 * the top row. Once docked (`data-state="rings"`) the header's ring row takes over.
 */
export const HOME_DIALS_CLASS =
  "data-[morph]:relative data-[morph]:z-[25] data-[morph]:[&_[data-dial]]:pointer-events-none data-[morph]:data-[state=top]:[&_[data-dial-part=ring]]:pointer-events-auto data-[morph]:data-[state=top]:[&_[data-dial-part=below]]:pointer-events-auto";

/** Collapse progress at which the mini rings take over from the dials. */
export const RINGS_AT = 1;

/** top until the dials have fully shrunk into the ring row; rings from there. */
export function nextHeaderState(progress: number): HeaderState {
  return progress >= RINGS_AT ? "rings" : "top";
}
