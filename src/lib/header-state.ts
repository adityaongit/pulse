// Home's collapsing header (spec §4.3): which rows show for a scroll position and direction.

export type HeaderState = "top" | "rings" | "rings-only";

/** Marks the bottom of Home's dial labels; the header collapses once it passes under the top row. */
export const HEADER_SENTINEL = "data-header-sentinel";

/** Scroll distance in one direction that counts as intent (inferred, I6). */
export const DIRECTION_PX = 8;
/** How far past the dial row the top row may start hiding (inferred, I6). */
export const HIDE_AFTER_PX = 160;

export type HeaderInput = {
  prev: HeaderState;
  /** The dial row (labels included) is still below the header's top row. */
  dialsVisible: boolean;
  /** Scroll position. */
  y: number;
  /** y minus the y at the last direction change: positive scrolling down, negative scrolling up. */
  dy: number;
  /** y from which the top row may hide: the dial row's bottom + HIDE_AFTER_PX. */
  hideAfter: number;
};

/**
 * top while the dials show; rings once they pass under the top row, near them or after an upward
 * scroll; rings-only deep in the page after a downward scroll. Anything else keeps the state.
 */
export function nextHeaderState({ prev, dialsVisible, y, dy, hideAfter }: HeaderInput): HeaderState {
  if (dialsVisible) return "top";
  if (y < hideAfter || dy <= -DIRECTION_PX) return "rings";
  if (dy >= DIRECTION_PX) return "rings-only";
  return prev === "top" ? "rings" : prev;
}
