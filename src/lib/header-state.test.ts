import { describe, expect, it } from "vitest";
import { nextHeaderState, type HeaderState } from "./header-state";

const at = (prev: HeaderState, o: { dialsVisible?: boolean; y: number; dy: number }) =>
  nextHeaderState({ prev, dialsVisible: o.dialsVisible ?? false, y: o.y, dy: o.dy, hideAfter: 460 });

describe("nextHeaderState", () => {
  it("stays expanded while the dials are visible, whatever the direction", () => {
    expect(at("top", { dialsVisible: true, y: 120, dy: 40 })).toBe("top");
    expect(at("rings", { dialsVisible: true, y: 200, dy: -40 })).toBe("top");
    expect(at("rings-only", { dialsVisible: true, y: 280, dy: -2 })).toBe("top");
  });

  it("collapses to the ring row once the dials pass under the top row", () => {
    expect(at("top", { y: 310, dy: 30 })).toBe("rings");
    // Within 160 px of the dials the top row never hides, even scrolling down.
    expect(at("rings", { y: 450, dy: 200 })).toBe("rings");
  });

  it("hides the top row deep in the page on a downward scroll of 8 px or more", () => {
    expect(at("rings", { y: 900, dy: 8 })).toBe("rings-only");
    expect(at("rings", { y: 900, dy: 7 })).toBe("rings");
  });

  it("brings the top row back on an upward scroll of 8 px or more", () => {
    expect(at("rings-only", { y: 1400, dy: -8 })).toBe("rings");
    expect(at("rings-only", { y: 1400, dy: -7 })).toBe("rings-only");
  });

  it("goes back to the full header when scrolled up to the dials", () => {
    let s: HeaderState = "top";
    for (const step of [
      { y: 320, dy: 320 },
      { y: 1200, dy: 1200 },
      { y: 1150, dy: -50 },
      { y: 200, dy: -1000, dialsVisible: true },
    ])
      s = at(s, step);
    expect(s).toBe("top");
  });

  it("enters the ring row from the top state even on a jump with no clear direction", () => {
    expect(at("top", { y: 1500, dy: 0 })).toBe("rings");
  });
});
