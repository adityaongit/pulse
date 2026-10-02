// Home's collapsing header (spec §4.3): which rows show for a scroll position.
// WHOOP keeps the top row (avatar, streak, date pill, sync) AND adds the Sleep / Recovery / Strain
// ring row once the dials scroll away; the top row never hides (user correction, 2026-10-03).

export type HeaderState = "top" | "rings";

/** Marks the bottom of Home's dial labels; the header collapses once it passes under the top row. */
export const HEADER_SENTINEL = "data-header-sentinel";

/** top while the dials show under the header; rings once they have scrolled under it. */
export function nextHeaderState({ dialsVisible }: { dialsVisible: boolean }): HeaderState {
  return dialsVisible ? "top" : "rings";
}
