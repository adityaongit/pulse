import { describe, expect, it } from "vitest";
import { nextHeaderState } from "./header-state";

describe("nextHeaderState", () => {
  it("stays expanded while the dials are visible", () => {
    expect(nextHeaderState({ dialsVisible: true })).toBe("top");
  });

  it("adds the ring row, keeping the top row, once the dials pass under the header", () => {
    expect(nextHeaderState({ dialsVisible: false })).toBe("rings");
  });
});
